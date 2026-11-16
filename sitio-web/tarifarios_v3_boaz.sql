-- ════════════════════════════════════════════════════════════════
-- TARIFARIOS v3 (Boaz ERP) — formas de cobro por pedido
--   · Precio fijo por pedido          (ej. Logispro: S/ 4 por entrega)
--   · Tarifa por distrito             (ej. Intelogis)
--   · Recargo por embalaje            (ej. NdLgth en pedidos de agencia)
-- Se puede ejecutar más de una vez sin problema.
-- ════════════════════════════════════════════════════════════════

-- 1) Forma de cobro por pedido de cada cliente
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS modo_pedido text NOT NULL DEFAULT 'tarifario';
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS precio_fijo_pedido numeric;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS recargo_embalaje numeric NOT NULL DEFAULT 0;
DO $$ BEGIN
  ALTER TABLE empresas ADD CONSTRAINT empresas_modo_pedido_chk CHECK (modo_pedido IN ('tarifario','fijo','distrito'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Tarifas por distrito de cada cliente
CREATE TABLE IF NOT EXISTS tarifas_distrito_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  distrito text NOT NULL,
  tarifa numeric NOT NULL CHECK (tarifa >= 0),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tarifas_distrito_cliente_uq ON tarifas_distrito_cliente (empresa_id, lower(distrito));

ALTER TABLE tarifas_distrito_cliente ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tarifas_distrito_cliente_staff_full ON tarifas_distrito_cliente;
CREATE POLICY tarifas_distrito_cliente_staff_full ON tarifas_distrito_cliente FOR ALL TO authenticated USING (es_staff_boaz()) WITH CHECK (es_staff_boaz());
REVOKE ALL ON tarifas_distrito_cliente FROM anon;
GRANT ALL ON tarifas_distrito_cliente TO authenticated;

-- 3) Recargo por embalaje registrado en cada pedido
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS con_embalaje boolean NOT NULL DEFAULT false;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS recargo_embalaje_s numeric NOT NULL DEFAULT 0;

-- Verificación
SELECT nombre, modo_pedido, precio_fijo_pedido, recargo_embalaje FROM empresas ORDER BY nombre;
