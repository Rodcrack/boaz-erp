-- ════════════════════════════════════════════════════════════════
-- VIAJES, RECOJOS Y SERVICIOS COTIZADOS (Boaz ERP)
-- Registro de lo que se cobra a un cliente fuera de los pedidos y de la
-- unidad por día: recojos, viajes y servicios cotizados en el momento.
-- Se puede ejecutar más de una vez sin problema.
-- ════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS servicios_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id),
  fecha date NOT NULL DEFAULT current_date,
  tipo text NOT NULL CHECK (tipo IN ('viaje','recojo','especial')),
  concepto text NOT NULL,
  tipo_vehiculo text,
  placa text,
  repartidor_id uuid REFERENCES repartidores(id),
  cantidad numeric NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  tarifa_unit numeric NOT NULL DEFAULT 0 CHECK (tarifa_unit >= 0),
  monto numeric NOT NULL DEFAULT 0,          -- cantidad x tarifa, sin IGV
  cotizacion_ref text,                       -- N° de cotización o referencia del acuerdo
  notas text,
  estado text NOT NULL DEFAULT 'realizado' CHECK (estado IN ('pendiente','realizado','anulado')),
  facturado boolean NOT NULL DEFAULT false,
  factura_ref text,
  creado_por text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS servicios_cliente_emp_fecha_idx ON servicios_cliente (empresa_id, fecha);

ALTER TABLE servicios_cliente ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS servicios_cliente_staff_full ON servicios_cliente;
CREATE POLICY servicios_cliente_staff_full ON servicios_cliente FOR ALL TO authenticated USING (es_staff_boaz()) WITH CHECK (es_staff_boaz());
REVOKE ALL ON servicios_cliente FROM anon;
GRANT ALL ON servicios_cliente TO authenticated;

-- Verificación
SELECT count(*) AS servicios_registrados FROM servicios_cliente;
