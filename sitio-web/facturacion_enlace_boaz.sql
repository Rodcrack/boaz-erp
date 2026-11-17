-- ══════════════════════════════════════════════════════════════════════
-- Boaz ERP · Enlace de facturas con la pre-facturación. Idempotente.
-- Ejecutar en Supabase → SQL Editor. Se puede correr más de una vez.
-- Qué hace:
--   1. Cada pedido y cada servicio guarda en qué factura se cobró (factura_id).
--   2. Nueva tabla facturas_unidades: qué días de cada unidad entraron en cada factura.
--   3. La factura guarda el período que cubre y su origen.
--   4. Si una factura se ANULA o se ELIMINA, todo lo que tenía vuelve a quedar por facturar.
-- ══════════════════════════════════════════════════════════════════════

-- 1 y 2) Columnas y tabla (usa el mismo tipo de id que ya tienen tus tablas)
DO $$
DECLARE t_fact text; t_asig text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO t_fact FROM pg_attribute a
   WHERE a.attrelid = 'public.facturas'::regclass AND a.attname = 'id';
  SELECT format_type(a.atttypid, a.atttypmod) INTO t_asig FROM pg_attribute a
   WHERE a.attrelid = 'public.asignaciones_unidad'::regclass AND a.attname = 'id';

  EXECUTE format('ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS factura_id %s REFERENCES facturas(id) ON DELETE SET NULL', t_fact);
  EXECUTE format('ALTER TABLE servicios_cliente ADD COLUMN IF NOT EXISTS factura_id %s REFERENCES facturas(id) ON DELETE SET NULL', t_fact);
  EXECUTE format('CREATE TABLE IF NOT EXISTS facturas_unidades (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      factura_id %s NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
      asignacion_id %s NOT NULL REFERENCES asignaciones_unidad(id) ON DELETE CASCADE,
      desde date NOT NULL, hasta date NOT NULL,
      dias numeric DEFAULT 0, monto numeric DEFAULT 0,
      created_at timestamptz DEFAULT now(),
      CHECK (hasta >= desde))', t_fact, t_asig);
END $$;

ALTER TABLE facturas ADD COLUMN IF NOT EXISTS periodo_desde date;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS periodo_hasta date;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS origen text;   -- 'prefacturacion' o vacío (registro manual)

CREATE INDEX IF NOT EXISTS pedidos_factura_idx        ON pedidos (factura_id);
CREATE INDEX IF NOT EXISTS servicios_cliente_fact_idx ON servicios_cliente (factura_id);
CREATE INDEX IF NOT EXISTS facturas_unidades_asig_idx ON facturas_unidades (asignacion_id, desde, hasta);
CREATE INDEX IF NOT EXISTS facturas_unidades_fact_idx ON facturas_unidades (factura_id);

-- Seguridad: igual que facturas (solo personal de Boaz con sesión)
ALTER TABLE facturas_unidades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS facturas_unidades_staff_full ON facturas_unidades;
CREATE POLICY facturas_unidades_staff_full ON facturas_unidades FOR ALL TO authenticated
  USING (es_staff_boaz()) WITH CHECK (es_staff_boaz());
REVOKE ALL ON facturas_unidades FROM anon;
GRANT ALL ON facturas_unidades TO authenticated;

-- 4) Anular o eliminar una factura libera lo que contenía
CREATE OR REPLACE FUNCTION liberar_items_factura() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NEW.estado IN ('anulada','anulado') THEN
    UPDATE pedidos           SET factura_id = NULL WHERE factura_id = OLD.id;
    UPDATE servicios_cliente SET factura_id = NULL, facturado = false WHERE factura_id = OLD.id;
    DELETE FROM facturas_unidades WHERE factura_id = OLD.id;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS facturas_liberar_al_anular ON facturas;
CREATE TRIGGER facturas_liberar_al_anular
  AFTER UPDATE OF estado ON facturas
  FOR EACH ROW WHEN (NEW.estado IN ('anulada','anulado') AND OLD.estado IS DISTINCT FROM NEW.estado)
  EXECUTE FUNCTION liberar_items_factura();

DROP TRIGGER IF EXISTS facturas_liberar_al_eliminar ON facturas;
CREATE TRIGGER facturas_liberar_al_eliminar
  BEFORE DELETE ON facturas
  FOR EACH ROW EXECUTE FUNCTION liberar_items_factura();

-- Verificación: las 4 filas deben decir OK
SELECT 'pedidos.factura_id' AS item, CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pedidos' AND column_name='factura_id') THEN 'OK' ELSE 'FALTA' END AS estado
UNION ALL SELECT 'servicios_cliente.factura_id', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='servicios_cliente' AND column_name='factura_id') THEN 'OK' ELSE 'FALTA' END
UNION ALL SELECT 'facturas_unidades', CASE WHEN to_regclass('public.facturas_unidades') IS NOT NULL THEN 'OK' ELSE 'FALTA' END
UNION ALL SELECT 'liberar al anular', CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='facturas_liberar_al_anular') THEN 'OK' ELSE 'FALTA' END;
