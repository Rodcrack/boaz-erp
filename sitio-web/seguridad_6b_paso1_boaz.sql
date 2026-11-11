-- ══════════════════════════════════════════════════════════════════════
-- Boaz ERP · Seguridad 6B · PASO 1 (seguro: no rompe nada de lo actual)
-- Crea sesiones con token, funciones seguras para la app del repartidor,
-- el portal de clientes y el seguimiento, y cifra los PIN.
-- Idempotente. Ejecutar completo en el SQL Editor de Supabase.
-- Ejecutar ANTES de subir el código nuevo. El PASO 2 se ejecuta DESPUÉS.
-- ══════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1) Sesiones (el token viaja en el navegador; en la base solo queda su huella)
CREATE TABLE IF NOT EXISTS sesiones_app (
  token_hash text PRIMARY KEY,
  tipo       text NOT NULL CHECK (tipo IN ('repartidor','cliente')),
  ref_id     uuid NOT NULL,
  empresa_id uuid,
  creada     timestamptz NOT NULL DEFAULT now(),
  expira     timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sesiones_app_expira_idx ON sesiones_app (expira);
ALTER TABLE sesiones_app ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sesiones_app FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS login_intentos (
  id bigserial PRIMARY KEY, tipo text NOT NULL, usuario text NOT NULL, creado timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_intentos_idx ON login_intentos (tipo, usuario, creado DESC);
ALTER TABLE login_intentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON login_intentos FROM anon, authenticated;

CREATE OR REPLACE FUNCTION _hash_token(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $$ SELECT encode(digest(p,'sha256'),'hex') $$;

CREATE OR REPLACE FUNCTION _nueva_sesion(p_tipo text, p_ref uuid, p_empresa uuid, p_horas int) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE t text;
BEGIN
  DELETE FROM sesiones_app WHERE expira < now();
  t := encode(gen_random_bytes(24),'hex');
  INSERT INTO sesiones_app (token_hash, tipo, ref_id, empresa_id, expira)
  VALUES (_hash_token(t), p_tipo, p_ref, p_empresa, now() + make_interval(hours => p_horas));
  RETURN t;
END $$;

CREATE OR REPLACE FUNCTION _sesion(p_token text, p_tipo text) RETURNS sesiones_app
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE s sesiones_app;
BEGIN
  SELECT * INTO s FROM sesiones_app
   WHERE token_hash = _hash_token(coalesce(p_token,'')) AND tipo = p_tipo AND expira > now();
  IF NOT FOUND THEN RAISE EXCEPTION 'sesion_invalida' USING ERRCODE = '28000'; END IF;
  RETURN s;
END $$;
REVOKE ALL ON FUNCTION _hash_token(text), _nueva_sesion(text,uuid,uuid,int), _sesion(text,text) FROM PUBLIC, anon, authenticated;

-- 2) PIN cifrado: se cifra solo al guardar (trigger) y se migran los actuales
CREATE OR REPLACE FUNCTION _cifrar_pin() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, extensions AS $$
BEGIN
  IF NEW.password_hash IS NOT NULL AND NEW.password_hash <> '' AND NEW.password_hash NOT LIKE '$2%' THEN
    NEW.password_hash := crypt(NEW.password_hash, gen_salt('bf'));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS repartidores_cifrar_pin ON repartidores;
CREATE TRIGGER repartidores_cifrar_pin BEFORE INSERT OR UPDATE OF password_hash ON repartidores
  FOR EACH ROW EXECUTE FUNCTION _cifrar_pin();
DROP TRIGGER IF EXISTS clientes_usuarios_cifrar_pin ON clientes_usuarios;
CREATE TRIGGER clientes_usuarios_cifrar_pin BEFORE INSERT OR UPDATE OF password_hash ON clientes_usuarios
  FOR EACH ROW EXECUTE FUNCTION _cifrar_pin();
UPDATE repartidores SET password_hash = password_hash WHERE password_hash IS NOT NULL AND password_hash <> '' AND password_hash NOT LIKE '$2%';
UPDATE clientes_usuarios SET password_hash = password_hash WHERE password_hash IS NOT NULL AND password_hash <> '' AND password_hash NOT LIKE '$2%';

-- 3) Logins: ahora devuelven también el token de sesión (compatible con la app anterior)
DROP FUNCTION IF EXISTS verificar_login_repartidor(text,text);
CREATE FUNCTION verificar_login_repartidor(p_usuario text, p_pin text)
RETURNS TABLE (id uuid, nombres text, apellidos text, telefono text, email text,
  vehiculo text, placa text, zona_default text, usuario text, token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE fallos int; r repartidores%ROWTYPE; u text := lower(coalesce(p_usuario,''));
BEGIN
  DELETE FROM login_intentos WHERE creado < now() - interval '1 day';
  SELECT count(*) INTO fallos FROM login_intentos WHERE tipo='repartidor' AND login_intentos.usuario=u AND creado > now() - interval '10 minutes';
  IF fallos >= 5 THEN RETURN; END IF;
  SELECT * INTO r FROM repartidores
   WHERE lower(repartidores.usuario) = u AND password_hash IS NOT NULL AND password_hash = crypt(coalesce(p_pin,''), password_hash) AND activo = true;
  IF NOT FOUND THEN
    INSERT INTO login_intentos (tipo, usuario) VALUES ('repartidor', u);
    RETURN;
  END IF;
  RETURN QUERY SELECT r.id, r.nombres, r.apellidos, r.telefono, r.email, r.vehiculo, r.placa, r.zona_default, r.usuario,
                      _nueva_sesion('repartidor', r.id, NULL, 16);
END $$;
GRANT EXECUTE ON FUNCTION verificar_login_repartidor(text,text) TO anon, authenticated;

DROP FUNCTION IF EXISTS verificar_login_cliente(text,text);
CREATE FUNCTION verificar_login_cliente(p_usuario text, p_pin text)
RETURNS TABLE (id uuid, nombres text, apellidos text, usuario text, empresa_id uuid, token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
#variable_conflict use_column
DECLARE fallos int; c clientes_usuarios%ROWTYPE; u text := lower(coalesce(p_usuario,''));
BEGIN
  SELECT count(*) INTO fallos FROM login_intentos WHERE tipo='cliente' AND login_intentos.usuario=u AND creado > now() - interval '10 minutes';
  IF fallos >= 5 THEN RETURN; END IF;
  SELECT * INTO c FROM clientes_usuarios
   WHERE lower(clientes_usuarios.usuario) = u AND password_hash IS NOT NULL AND password_hash = crypt(coalesce(p_pin,''), password_hash) AND activo = true;
  IF NOT FOUND THEN
    INSERT INTO login_intentos (tipo, usuario) VALUES ('cliente', u);
    RETURN;
  END IF;
  RETURN QUERY SELECT c.id, c.nombres, c.apellidos, c.usuario, c.empresa_id,
                      _nueva_sesion('cliente', c.id, c.empresa_id, 12);
END $$;
GRANT EXECUTE ON FUNCTION verificar_login_cliente(text,text) TO anon, authenticated;

-- 4) REPARTIDOR: solo ve y toca SUS pedidos
CREATE OR REPLACE FUNCTION rep_pedidos(p_token text) RETURNS SETOF pedidos
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE s sesiones_app;
BEGIN
  s := _sesion(p_token, 'repartidor');
  RETURN QUERY SELECT * FROM pedidos
   WHERE repartidor_id = s.ref_id
     AND (created_at > now() - interval '120 days' OR estado IN ('asignado','en_ruta')
          OR (coalesce(cobro_destino,false) AND NOT coalesce(liquidado_cod,false)))
   ORDER BY created_at DESC;
END $$;

CREATE OR REPLACE FUNCTION rep_pedido_actualizar(p_token text, p_ids uuid[], p_cambios jsonb, p_eventos jsonb DEFAULT '[]')
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE s sesiones_app; r pedidos; n int; c jsonb := coalesce(p_cambios,'{}'::jsonb);
BEGIN
  s := _sesion(p_token, 'repartidor');
  IF c ? 'estado' AND (c->>'estado') NOT IN ('en_ruta','entregado','no_entregado') THEN
    RAISE EXCEPTION 'estado_no_permitido';
  END IF;
  r := jsonb_populate_record(NULL::pedidos, c);
  UPDATE pedidos p SET
    estado               = CASE WHEN c ? 'estado' THEN r.estado ELSE p.estado END,
    fecha_inicio_ruta    = CASE WHEN c ? 'fecha_inicio_ruta' THEN r.fecha_inicio_ruta ELSE p.fecha_inicio_ruta END,
    fecha_entrega        = CASE WHEN c ? 'fecha_entrega' THEN r.fecha_entrega ELSE p.fecha_entrega END,
    recibido_por         = CASE WHEN c ? 'recibido_por' THEN r.recibido_por ELSE p.recibido_por END,
    comentario_entrega   = CASE WHEN c ? 'comentario_entrega' THEN r.comentario_entrega ELSE p.comentario_entrega END,
    motivo_no_entrega    = CASE WHEN c ? 'motivo_no_entrega' THEN r.motivo_no_entrega ELSE p.motivo_no_entrega END,
    comentario_no_entrega= CASE WHEN c ? 'comentario_no_entrega' THEN r.comentario_no_entrega ELSE p.comentario_no_entrega END,
    liquidado_cod        = CASE WHEN c ? 'liquidado_cod' THEN r.liquidado_cod ELSE p.liquidado_cod END,
    historial            = CASE WHEN jsonb_typeof(p_eventos) = 'array' AND jsonb_array_length(p_eventos) > 0
                                THEN coalesce(p.historial,'[]'::jsonb) || p_eventos ELSE p.historial END
  WHERE p.id = ANY(p_ids) AND p.repartidor_id = s.ref_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION rep_guardar_orden(p_token text, p_ids uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE s sesiones_app;
BEGIN
  s := _sesion(p_token, 'repartidor');
  UPDATE pedidos p SET orden_ruta = t.ord - 1
    FROM unnest(p_ids) WITH ORDINALITY AS t(id, ord)
   WHERE p.id = t.id AND p.repartidor_id = s.ref_id;
END $$;

CREATE OR REPLACE FUNCTION rep_ruta_activa(p_token text, p_fecha date) RETURNS SETOF rutas_repartidor
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE s sesiones_app;
BEGIN
  s := _sesion(p_token, 'repartidor');
  RETURN QUERY SELECT * FROM rutas_repartidor
   WHERE repartidor_id = s.ref_id AND fecha = p_fecha AND hora_fin IS NULL
   ORDER BY created_at DESC LIMIT 1;
END $$;

CREATE OR REPLACE FUNCTION rep_ruta_crear(p_token text, p_fecha date, p_lote uuid, p_total int, p_inicio timestamptz)
RETURNS rutas_repartidor LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE s sesiones_app; r rutas_repartidor;
BEGIN
  s := _sesion(p_token, 'repartidor');
  INSERT INTO rutas_repartidor (repartidor_id, fecha, lote_id, hora_inicio, total_pedidos)
  VALUES (s.ref_id, p_fecha, p_lote, p_inicio, p_total) RETURNING * INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION rep_ruta_finalizar(p_token text, p_id uuid, p_fin timestamptz, p_ent int, p_noent int) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE s sesiones_app;
BEGIN
  s := _sesion(p_token, 'repartidor');
  UPDATE rutas_repartidor SET hora_fin = p_fin, entregados = p_ent, no_entregados = p_noent
   WHERE id = p_id AND repartidor_id = s.ref_id;
END $$;

-- 5) CLIENTE: solo ve y crea pedidos de SU empresa
CREATE OR REPLACE FUNCTION cli_empresa(p_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE s sesiones_app; j jsonb;
BEGIN
  s := _sesion(p_token, 'cliente');
  SELECT jsonb_build_object('id',e.id,'nombre',e.nombre,'ruc',e.ruc,'contacto',e.contacto,'telefono',e.telefono,
         'email',e.email,'codigo_interno',e.codigo_interno,'puede_generar_etiquetas',e.puede_generar_etiquetas,
         'puede_ver_liquidacion',e.puede_ver_liquidacion)
    INTO j FROM empresas e WHERE e.id = s.empresa_id;
  RETURN j;
END $$;

CREATE OR REPLACE FUNCTION cli_pedidos(p_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE s sesiones_app; j jsonb;
BEGIN
  s := _sesion(p_token, 'cliente');
  SELECT coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object('repartidor_nombre', nullif(trim(coalesce(r.nombres,'')||' '||coalesce(r.apellidos,'')),'')) ORDER BY p.created_at DESC), '[]'::jsonb)
    INTO j FROM pedidos p LEFT JOIN repartidores r ON r.id = p.repartidor_id
   WHERE p.empresa_id = s.empresa_id;
  RETURN j;
END $$;

CREATE OR REPLACE FUNCTION cli_crear_pedido(p_token text, p_datos jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE s sesiones_app; d pedidos; codigo text;
BEGIN
  s := _sesion(p_token, 'cliente');
  d := jsonb_populate_record(NULL::pedidos, coalesce(p_datos,'{}'::jsonb));
  IF coalesce(trim(d.dest_nombre),'') = '' OR coalesce(trim(d.dest_direccion),'') = '' THEN
    RAISE EXCEPTION 'datos_incompletos';
  END IF;
  codigo := generar_codigo_boaz();
  INSERT INTO pedidos (omd, empresa_id, cliente_referencia, dest_nombre, dest_telefono, dest_direccion, dest_referencia,
                       dest_distrito, peso_kg, tipo_servicio, cobro_destino, monto_cobrar, dest_lat, dest_lng, estado)
  VALUES (codigo, s.empresa_id, d.cliente_referencia, d.dest_nombre, d.dest_telefono, d.dest_direccion, d.dest_referencia,
          d.dest_distrito, d.peso_kg, d.tipo_servicio, coalesce(d.cobro_destino,false),
          CASE WHEN coalesce(d.cobro_destino,false) THEN d.monto_cobrar ELSE NULL END, d.dest_lat, d.dest_lng, 'sin_asignar');
  RETURN codigo;
END $$;

-- 6) SEGUIMIENTO PÚBLICO: datos mínimos y con privacidad (sin teléfono, sin GPS, nombre y dirección enmascarados)
CREATE OR REPLACE FUNCTION tracking_publico(p_omds text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE p pedidos; j jsonb;
BEGIN
  SELECT * INTO p FROM pedidos WHERE omd = ANY(p_omds) ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  j := jsonb_build_object(
    'omd', p.omd, 'estado', p.estado, 'created_at', p.created_at, 'fecha_entrega', p.fecha_entrega,
    'fecha_programada', p.fecha_programada, 'peso_kg', p.peso_kg, 'motivo_no_entrega', p.motivo_no_entrega,
    'cobro_destino', p.cobro_destino, 'monto_cobrar', p.monto_cobrar, 'cliente_referencia', p.cliente_referencia,
    'dest_nombre', regexp_replace(trim(coalesce(p.dest_nombre,'')), '^(\S+)\s+(\S).*$', '\1 \2.'),
    'dest_direccion', regexp_replace(coalesce(p.dest_direccion,''), '[0-9]', '•', 'g'),
    'dest_referencia', regexp_replace(coalesce(p.dest_referencia,''), '[0-9]', '•', 'g'),
    'dest_distrito', p.dest_distrito,
    'historial', coalesce((SELECT jsonb_agg(e - 'lat' - 'lng') FROM jsonb_array_elements(coalesce(p.historial,'[]'::jsonb)) e), '[]'::jsonb)
  );
  RETURN j;
END $$;

REVOKE ALL ON FUNCTION rep_pedidos(text), rep_pedido_actualizar(text,uuid[],jsonb,jsonb), rep_guardar_orden(text,uuid[]),
  rep_ruta_activa(text,date), rep_ruta_crear(text,date,uuid,int,timestamptz), rep_ruta_finalizar(text,uuid,timestamptz,int,int),
  cli_empresa(text), cli_pedidos(text), cli_crear_pedido(text,jsonb), tracking_publico(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rep_pedidos(text), rep_pedido_actualizar(text,uuid[],jsonb,jsonb), rep_guardar_orden(text,uuid[]),
  rep_ruta_activa(text,date), rep_ruta_crear(text,date,uuid,int,timestamptz), rep_ruta_finalizar(text,uuid,timestamptz,int,int),
  cli_empresa(text), cli_pedidos(text), cli_crear_pedido(text,jsonb), tracking_publico(text[]) TO anon, authenticated;
