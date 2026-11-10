-- Control de gastos / ingresos Boaz ERP (idempotente)
CREATE TABLE IF NOT EXISTS gastos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  tipo text NOT NULL DEFAULT 'egreso' CHECK (tipo IN ('egreso','ingreso')),
  categoria text NOT NULL DEFAULT 'Otros',
  placa text,
  descripcion text,
  proveedor text,
  monto numeric(12,2) NOT NULL DEFAULT 0,
  igv numeric(12,2) NOT NULL DEFAULT 0,
  metodo_pago text,
  comprobante_tipo text,
  comprobante_numero text,
  comprobante_url text,
  km integer,
  galones numeric(10,2),
  proximo_mant_km integer,
  proximo_mant_fecha date,
  notas text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gastos_fecha_idx ON gastos (fecha);
CREATE INDEX IF NOT EXISTS gastos_placa_idx ON gastos (placa);

ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gastos_staff_full ON gastos;
CREATE POLICY gastos_staff_full ON gastos FOR ALL TO authenticated
  USING (es_staff_boaz()) WITH CHECK (es_staff_boaz());
REVOKE ALL ON gastos FROM anon;
GRANT ALL ON gastos TO authenticated;
