-- ════════════════════════════════════════════════════════════════
-- FINANZAS CONECTADAS (Boaz ERP)
-- Guarda la fecha en que se paga cada liquidación de repartidor, para que
-- el Dashboard de Finanzas y Gastos la cuenten en el mes correcto.
-- Se puede ejecutar más de una vez sin problema.
-- ════════════════════════════════════════════════════════════════
ALTER TABLE liquidaciones ADD COLUMN IF NOT EXISTS fecha_pago date;

-- Liquidaciones que ya estaban pagadas: se toma la fecha de la propia liquidación
UPDATE liquidaciones SET fecha_pago = COALESCE(fecha, created_at::date)
WHERE estado = 'pagado' AND fecha_pago IS NULL;

-- Verificación
SELECT estado, count(*) AS liquidaciones, sum(monto_ganado_s) AS monto FROM liquidaciones GROUP BY estado;
