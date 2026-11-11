-- ══════════════════════════════════════════════════════════════════════
-- Boaz ERP · Rendimiento 6C. Idempotente. Ejecutar en el SQL Editor de Supabase.
-- ══════════════════════════════════════════════════════════════════════
-- Lista de pedidos SIN la columna pesada "historial" (fotos y GPS de cada evento).
-- El ERP la usa para cargar más rápido; el historial se pide solo al abrir un pedido.
-- Respeta la seguridad por filas (corre con los permisos de quien consulta).
CREATE OR REPLACE FUNCTION pedidos_lista() RETURNS SETOF jsonb
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT to_jsonb(p) - 'historial' FROM pedidos p ORDER BY p.created_at DESC, p.id
$$;
REVOKE ALL ON FUNCTION pedidos_lista() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pedidos_lista() TO authenticated;

-- Índices para el mapa de flota y las listas por estado
CREATE INDEX IF NOT EXISTS pedidos_entrega_idx ON pedidos (fecha_entrega);
CREATE INDEX IF NOT EXISTS pedidos_estado_rep_idx ON pedidos (estado, repartidor_id);
