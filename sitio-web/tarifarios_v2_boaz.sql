-- ══════════════════════════════════════════════════════════════════════
-- Boaz ERP · Tarifarios v2: modalidades por cliente (pedido / vehículo / viaje)
-- Idempotente. Ejecutar completo en el SQL Editor de Supabase.
-- ══════════════════════════════════════════════════════════════════════

-- 1) Modalidades de tarifario habilitadas por cliente
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS modalidades_tarifa text[] NOT NULL DEFAULT '{}';

-- 2) Tarifario por vehículo del cliente: había dos tablas (tarifario_ y tarifarios_).
--    La pantalla guardaba en una y leía de la otra. Se unifica en tarifarios_vehiculo_cliente.
CREATE TABLE IF NOT EXISTS tarifarios_vehiculo_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES empresas(id) NOT NULL,
  tipo_vehiculo text NOT NULL,
  tarifa_base numeric NOT NULL,
  recargo_periferico numeric DEFAULT 0,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(empresa_id, tipo_vehiculo)
);
ALTER TABLE tarifarios_vehiculo_cliente ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tarifarios_vehiculo_cliente_staff_full ON tarifarios_vehiculo_cliente;
CREATE POLICY tarifarios_vehiculo_cliente_staff_full ON tarifarios_vehiculo_cliente FOR ALL TO authenticated USING (es_staff_boaz()) WITH CHECK (es_staff_boaz());
GRANT ALL ON tarifarios_vehiculo_cliente TO authenticated;

DO $$
BEGIN
  IF to_regclass('public.tarifario_vehiculo_cliente') IS NOT NULL THEN
    INSERT INTO tarifarios_vehiculo_cliente (empresa_id, tipo_vehiculo, tarifa_base, recargo_periferico, activo)
    SELECT empresa_id, tipo_vehiculo, tarifa_dia, coalesce(recargo_periferico,0), coalesce(activo,true)
    FROM tarifario_vehiculo_cliente
    ON CONFLICT (empresa_id, tipo_vehiculo) DO NOTHING;
  END IF;
END $$;

-- 3) Tarifario por viaje (estándar y por cliente). "unidad": viaje | recojo
CREATE TABLE IF NOT EXISTS tarifario_viaje_estandar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concepto text NOT NULL,
  tipo_vehiculo text,
  unidad text NOT NULL DEFAULT 'viaje' CHECK (unidad IN ('viaje','recojo')),
  tarifa numeric NOT NULL,
  activo boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tarifarios_viaje_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES empresas(id) ON DELETE CASCADE NOT NULL,
  concepto text NOT NULL,
  tipo_vehiculo text,
  unidad text NOT NULL DEFAULT 'viaje' CHECK (unidad IN ('viaje','recojo')),
  tarifa numeric NOT NULL,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tarifarios_viaje_cliente_emp_idx ON tarifarios_viaje_cliente (empresa_id);
ALTER TABLE tarifario_viaje_estandar ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarifarios_viaje_cliente ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tarifario_viaje_estandar_staff_full ON tarifario_viaje_estandar;
DROP POLICY IF EXISTS tarifarios_viaje_cliente_staff_full ON tarifarios_viaje_cliente;
CREATE POLICY tarifario_viaje_estandar_staff_full ON tarifario_viaje_estandar FOR ALL TO authenticated USING (es_staff_boaz()) WITH CHECK (es_staff_boaz());
CREATE POLICY tarifarios_viaje_cliente_staff_full ON tarifarios_viaje_cliente FOR ALL TO authenticated USING (es_staff_boaz()) WITH CHECK (es_staff_boaz());
REVOKE ALL ON tarifario_viaje_estandar, tarifarios_viaje_cliente FROM anon;
GRANT ALL ON tarifario_viaje_estandar, tarifarios_viaje_cliente TO authenticated;

-- 4) Marca las modalidades que cada cliente ya usa (solo a los que aún no tienen ninguna marcada)
UPDATE empresas e SET modalidades_tarifa = ARRAY(
  SELECT m FROM (VALUES
    ('pedido',   EXISTS (SELECT 1 FROM tarifarios_cliente t WHERE t.empresa_id = e.id)),
    ('vehiculo', EXISTS (SELECT 1 FROM tarifarios_vehiculo_cliente t WHERE t.empresa_id = e.id)
                 OR EXISTS (SELECT 1 FROM asignaciones_unidad a WHERE a.empresa_id = e.id)),
    ('viaje',    EXISTS (SELECT 1 FROM tarifarios_viaje_cliente t WHERE t.empresa_id = e.id))
  ) AS x(m, usa) WHERE usa
) WHERE e.modalidades_tarifa = '{}';

-- Verificación: clientes y modalidades marcadas
SELECT nombre, modalidades_tarifa FROM empresas ORDER BY nombre;
