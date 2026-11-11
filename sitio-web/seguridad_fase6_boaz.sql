-- ══════════════════════════════════════════════════════════════
-- Boaz ERP · Seguridad y rendimiento (Fase 6A)
-- Idempotente. Ejecutar completo en el SQL Editor de Supabase.
-- (La advertencia "destructive operation" es normal: solo quita una política.)
-- ══════════════════════════════════════════════════════════════

-- 1) CRÍTICO: un usuario del ERP ya NO puede editar su propia fila (podía cambiarse el rol a admin).
--    Los administradores siguen gestionando cuentas con la política usuarios_admin_all.
DROP POLICY IF EXISTS usuarios_propio_update ON usuarios;

-- 2) Anti fuerza bruta en los logins por PIN (repartidor y cliente):
--    5 intentos fallidos por usuario en 10 minutos => se bloquea 10 minutos.
CREATE TABLE IF NOT EXISTS login_intentos (
  id bigserial PRIMARY KEY,
  tipo text NOT NULL,
  usuario text NOT NULL,
  creado timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_intentos_idx ON login_intentos (tipo, usuario, creado DESC);
ALTER TABLE login_intentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON login_intentos FROM anon, authenticated;

CREATE OR REPLACE FUNCTION verificar_login_repartidor(p_usuario text, p_pin text)
RETURNS TABLE (id uuid, nombres text, apellidos text, telefono text, email text,
  vehiculo text, placa text, zona_default text, usuario text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fallos int;
BEGIN
  DELETE FROM login_intentos WHERE creado < now() - interval '1 day';
  SELECT count(*) INTO fallos FROM login_intentos
    WHERE tipo='repartidor' AND usuario=lower(coalesce(p_usuario,'')) AND creado > now() - interval '10 minutes';
  IF fallos >= 5 THEN RETURN; END IF;
  RETURN QUERY
  SELECT r.id, r.nombres, r.apellidos, r.telefono, r.email, r.vehiculo, r.placa, r.zona_default, r.usuario
  FROM repartidores r
  WHERE lower(r.usuario) = lower(p_usuario) AND r.password_hash = p_pin AND r.activo = true;
  IF NOT FOUND THEN
    INSERT INTO login_intentos (tipo, usuario) VALUES ('repartidor', lower(coalesce(p_usuario,'')));
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION verificar_login_repartidor(text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION verificar_login_cliente(p_usuario text, p_pin text)
RETURNS TABLE (id uuid, nombres text, apellidos text, usuario text, empresa_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fallos int;
BEGIN
  SELECT count(*) INTO fallos FROM login_intentos
    WHERE tipo='cliente' AND usuario=lower(coalesce(p_usuario,'')) AND creado > now() - interval '10 minutes';
  IF fallos >= 5 THEN RETURN; END IF;
  RETURN QUERY
  SELECT c.id, c.nombres, c.apellidos, c.usuario, c.empresa_id
  FROM clientes_usuarios c
  WHERE lower(c.usuario) = lower(p_usuario) AND c.password_hash = p_pin AND c.activo = true;
  IF NOT FOUND THEN
    INSERT INTO login_intentos (tipo, usuario) VALUES ('cliente', lower(coalesce(p_usuario,'')));
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION verificar_login_cliente(text,text) TO anon, authenticated;

-- 3) Rendimiento: índices en las tablas que más se consultan
CREATE INDEX IF NOT EXISTS pedidos_created_idx    ON pedidos (created_at DESC);
CREATE INDEX IF NOT EXISTS pedidos_estado_idx     ON pedidos (estado);
CREATE INDEX IF NOT EXISTS pedidos_repartidor_idx ON pedidos (repartidor_id);
CREATE INDEX IF NOT EXISTS pedidos_empresa_idx    ON pedidos (empresa_id);
CREATE INDEX IF NOT EXISTS pedidos_omd_idx        ON pedidos (omd);
CREATE INDEX IF NOT EXISTS facturas_empresa_idx   ON facturas (empresa_id);
CREATE INDEX IF NOT EXISTS facturas_emision_idx   ON facturas (fecha_emision);
CREATE INDEX IF NOT EXISTS facturas_pago_idx      ON facturas (estado_pago);

-- 4) Verificación: lista las políticas que dejan entrar a usuarios sin sesión (rol anon).
--    Estas son las que hay que cerrar en la Fase 6B.
SELECT tablename, policyname, cmd FROM pg_policies
WHERE schemaname='public' AND 'anon' = ANY(roles) ORDER BY tablename, policyname;
