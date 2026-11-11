-- Fase 3 Boaz ERP: documentos de flota (idempotente)
CREATE TABLE IF NOT EXISTS vehiculo_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placa text NOT NULL,
  tipo text NOT NULL,
  numero text,
  fecha_emision date,
  fecha_vencimiento date,
  proveedor text,
  monto numeric(12,2),
  archivo_url text,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vehiculo_documentos_placa_idx ON vehiculo_documentos (placa);
CREATE INDEX IF NOT EXISTS vehiculo_documentos_venc_idx ON vehiculo_documentos (fecha_vencimiento);

ALTER TABLE vehiculo_documentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vehiculo_documentos_staff_full ON vehiculo_documentos;
CREATE POLICY vehiculo_documentos_staff_full ON vehiculo_documentos FOR ALL TO authenticated
  USING (es_staff_boaz()) WITH CHECK (es_staff_boaz());
REVOKE ALL ON vehiculo_documentos FROM anon;
GRANT ALL ON vehiculo_documentos TO authenticated;

-- Base del modelo de rentabilidad (si no se ejecutó antes)
ALTER TABLE repartidores ADD COLUMN IF NOT EXISTS modo_pago text DEFAULT 'por_pedido';
ALTER TABLE repartidores ADD COLUMN IF NOT EXISTS tarifa_variable numeric DEFAULT 0;
ALTER TABLE repartidores ADD COLUMN IF NOT EXISTS sueldo_fijo_mensual numeric DEFAULT 0;
ALTER TABLE unidades_transporte ADD COLUMN IF NOT EXISTS auxiliar_id uuid REFERENCES repartidores(id);
