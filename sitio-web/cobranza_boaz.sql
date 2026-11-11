-- Cobranza Boaz ERP (idempotente)
-- Seguimiento de detracciones en facturas
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS detraccion_depositada boolean NOT NULL DEFAULT false;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS detraccion_fecha date;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS detraccion_constancia text;

-- Rendición de cobros contraentrega (COD) por pedido
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cod_rendido boolean NOT NULL DEFAULT false;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cod_rendido_fecha date;
CREATE INDEX IF NOT EXISTS pedidos_cod_pend_idx ON pedidos (cobro_destino, cod_rendido) WHERE cobro_destino = true;
