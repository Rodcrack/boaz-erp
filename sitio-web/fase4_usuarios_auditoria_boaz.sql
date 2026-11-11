-- ══════════════════════════════════════════════════════════════
-- Fase 4 Boaz ERP: usuarios y roles, auditoría automática, incidencias
-- Idempotente: se puede ejecutar más de una vez.
-- ══════════════════════════════════════════════════════════════

-- 1) Función: ¿el usuario actual es administrador activo?
CREATE OR REPLACE FUNCTION es_admin_boaz()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND activo = true AND rol = 'admin');
$$;

-- 2) Los administradores pueden ver y editar todas las cuentas del ERP
DROP POLICY IF EXISTS usuarios_admin_all ON usuarios;
CREATE POLICY usuarios_admin_all ON usuarios FOR ALL TO authenticated
  USING (es_admin_boaz()) WITH CHECK (es_admin_boaz());

-- 3) Cuentas creadas en Supabase Auth que aún no están activadas en el ERP (solo admin)
CREATE OR REPLACE FUNCTION usuarios_auth_pendientes()
RETURNS TABLE (id uuid, email text, creado timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT es_admin_boaz() THEN RAISE EXCEPTION 'Solo administradores'; END IF;
  RETURN QUERY
    SELECT u.id, u.email::text, u.created_at
    FROM auth.users u
    WHERE NOT EXISTS (SELECT 1 FROM public.usuarios x WHERE x.id = u.id)
      AND NOT EXISTS (SELECT 1 FROM public.clientes_usuarios c WHERE c.id = u.id)
    ORDER BY u.created_at DESC;
END $$;
REVOKE ALL ON FUNCTION usuarios_auth_pendientes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION usuarios_auth_pendientes() TO authenticated;

-- 4) Permisos por rol (qué módulos ve cada rol)
CREATE TABLE IF NOT EXISTS roles_permisos (
  rol text PRIMARY KEY,
  modulos text[] NOT NULL DEFAULT '{}',
  descripcion text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE roles_permisos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS roles_permisos_lectura ON roles_permisos;
CREATE POLICY roles_permisos_lectura ON roles_permisos FOR SELECT TO authenticated USING (es_staff_boaz());
DROP POLICY IF EXISTS roles_permisos_admin ON roles_permisos;
CREATE POLICY roles_permisos_admin ON roles_permisos FOR ALL TO authenticated USING (es_admin_boaz()) WITH CHECK (es_admin_boaz());
REVOKE ALL ON roles_permisos FROM anon;
GRANT ALL ON roles_permisos TO authenticated;

INSERT INTO roles_permisos (rol, modulos, descripcion) VALUES
 ('admin', ARRAY['dashboard','pedidos','repartidores','unidades','incidencias','inventario','clientes','cotizaciones','catalogo','liquidacion-clientes','facturacion','cobranza','liquidaciones','liquidacion-transporte','planilla','gastos','reportes','rentabilidad','usuarios','configuracion'], 'Acceso total'),
 ('operaciones', ARRAY['dashboard','pedidos','repartidores','unidades','incidencias','inventario','clientes','cotizaciones','catalogo'], 'Operación diaria y comercial básico'),
 ('finanzas', ARRAY['dashboard','clientes','cotizaciones','catalogo','liquidacion-clientes','facturacion','cobranza','liquidaciones','liquidacion-transporte','planilla','gastos','reportes','rentabilidad'], 'Facturación, cobranza, costos y reportes')
ON CONFLICT (rol) DO NOTHING;

-- 5) Incidencias y reclamos
CREATE TABLE IF NOT EXISTS incidencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid,
  omd text,
  empresa_id uuid,
  repartidor_id uuid,
  tipo text NOT NULL,
  descripcion text,
  estado text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','en_proceso','resuelta')),
  resolucion text,
  responsable text,
  costo_s numeric(12,2) NOT NULL DEFAULT 0,
  evidencia_url text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resuelta_at timestamptz
);
CREATE INDEX IF NOT EXISTS incidencias_estado_idx ON incidencias (estado);
CREATE INDEX IF NOT EXISTS incidencias_empresa_idx ON incidencias (empresa_id);
ALTER TABLE incidencias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS incidencias_staff_full ON incidencias;
CREATE POLICY incidencias_staff_full ON incidencias FOR ALL TO authenticated USING (es_staff_boaz()) WITH CHECK (es_staff_boaz());
REVOKE ALL ON incidencias FROM anon;
GRANT ALL ON incidencias TO authenticated;

-- 6) Auditoría automática: quién cambió qué y cuándo
CREATE TABLE IF NOT EXISTS auditoria (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  usuario_id uuid,
  email text,
  tabla text NOT NULL,
  operacion text NOT NULL,
  registro_id text,
  antes jsonb,
  despues jsonb
);
CREATE INDEX IF NOT EXISTS auditoria_fecha_idx ON auditoria (created_at DESC);
CREATE INDEX IF NOT EXISTS auditoria_tabla_idx ON auditoria (tabla);
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auditoria_admin_select ON auditoria;
CREATE POLICY auditoria_admin_select ON auditoria FOR SELECT TO authenticated USING (es_admin_boaz());
REVOKE ALL ON auditoria FROM anon;
GRANT SELECT ON auditoria TO authenticated;

CREATE OR REPLACE FUNCTION auditar_cambio()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old jsonb; v_new jsonb; v_id text; v_email text;
  d_old jsonb := '{}'::jsonb; d_new jsonb := '{}'::jsonb; k text;
  secretos text[] := ARRAY['pin','pin_acceso','password','clave'];
BEGIN
  BEGIN v_email := auth.jwt() ->> 'email'; EXCEPTION WHEN OTHERS THEN v_email := NULL; END;
  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW) - secretos; v_id := v_new ->> 'id';
  ELSIF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD) - secretos; v_id := v_old ->> 'id';
  ELSE
    v_old := to_jsonb(OLD) - secretos; v_new := to_jsonb(NEW) - secretos; v_id := v_new ->> 'id';
    FOR k IN SELECT jsonb_object_keys(v_new) LOOP
      IF k <> 'updated_at' AND (v_new -> k) IS DISTINCT FROM (v_old -> k) THEN
        d_old := d_old || jsonb_build_object(k, v_old -> k);
        d_new := d_new || jsonb_build_object(k, v_new -> k);
      END IF;
    END LOOP;
    IF d_new = '{}'::jsonb THEN RETURN NEW; END IF;
    v_old := d_old; v_new := d_new;
  END IF;
  INSERT INTO auditoria (usuario_id, email, tabla, operacion, registro_id, antes, despues)
  VALUES (auth.uid(), NULLIF(v_email,''), TG_TABLE_NAME, TG_OP, v_id, v_old, v_new);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

-- Activar la auditoría en las tablas importantes (si la tabla existe)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['facturas','gastos','liquidaciones','repartidores','empresas','vehiculo_documentos',
    'pagos_planilla','pagos_terceros','tarifarios_cliente','tarifarios_vehiculo_cliente','tarifario_estandar',
    'unidades_transporte','asignaciones_unidad','usuarios','roles_permisos','incidencias','cotizaciones']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_auditoria ON public.%I', t);
      EXECUTE format('CREATE TRIGGER trg_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION auditar_cambio()', t);
    END IF;
  END LOOP;
  -- pedidos: solo se audita la eliminación (los cambios de estado son muy frecuentes)
  IF to_regclass('public.pedidos') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_auditoria_del ON public.pedidos;
    CREATE TRIGGER trg_auditoria_del AFTER DELETE ON public.pedidos FOR EACH ROW EXECUTE FUNCTION auditar_cambio();
  END IF;
END $$;
