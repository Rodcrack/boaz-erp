-- ════════════════════════════════════════════════════════════════
-- VERIFICADOR DE INSTALACIÓN (Boaz ERP)
-- Solo consulta: no cambia nada. Ejecútalo cuando quieras en Supabase → SQL Editor.
-- Cada fila dice si ese archivo SQL ya está aplicado en tu base de datos.
-- ════════════════════════════════════════════════════════════════
WITH c AS (
  SELECT
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='empresas' AND column_name='modalidades_tarifa') AS v2_a,
    to_regclass('public.tarifarios_viaje_cliente') IS NOT NULL AS v2_b,
    EXISTS (SELECT 1 FROM tipos_servicio WHERE codigo IN ('TC-VIA','UM-VIA')) AS tipos,
    CASE WHEN to_regclass('public.empresas_codigo_seq') IS NULL THEN false ELSE has_sequence_privilege('authenticated', to_regclass('public.empresas_codigo_seq')::oid, 'USAGE') END AS secuencias,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='empresas' AND column_name='modo_pedido') AS v3_a,
    to_regclass('public.tarifas_distrito_cliente') IS NOT NULL AS v3_b,
    to_regclass('public.servicios_cliente') IS NOT NULL AS servicios,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='liquidaciones' AND column_name='fecha_pago') AS finanzas,
    to_regclass('public.login_intentos') IS NOT NULL AS seg6,
    EXISTS (SELECT 1 FROM pg_proc WHERE proname='rep_pedidos') AS seg6b1,
    EXISTS (SELECT 1 FROM pg_proc WHERE proname='pedidos_lista') AS rend6c,
    NOT has_table_privilege('anon', 'public.pedidos', 'SELECT') AS seg6b2
)
SELECT * FROM (
  SELECT 1 AS orden, 'seguridad_fase6_boaz.sql' AS archivo, CASE WHEN seg6 THEN 'OK - aplicado' ELSE 'FALTA ejecutar' END AS estado FROM c
  UNION ALL SELECT 2, 'seguridad_6b_paso1_boaz.sql', CASE WHEN seg6b1 THEN 'OK - aplicado' ELSE 'FALTA ejecutar' END FROM c
  UNION ALL SELECT 3, 'rendimiento_6c_boaz.sql', CASE WHEN rend6c THEN 'OK - aplicado' ELSE 'FALTA ejecutar' END FROM c
  UNION ALL SELECT 4, 'fix_secuencias_boaz.sql', CASE WHEN secuencias THEN 'OK - aplicado' ELSE 'FALTA ejecutar' END FROM c
  UNION ALL SELECT 5, 'tarifarios_v2_boaz.sql', CASE WHEN v2_a AND v2_b THEN 'OK - aplicado' ELSE 'FALTA ejecutar' END FROM c
  UNION ALL SELECT 6, 'tipos_servicio_viaje_especial_boaz.sql', CASE WHEN tipos THEN 'OK - aplicado' ELSE 'FALTA ejecutar' END FROM c
  UNION ALL SELECT 7, 'tarifarios_v3_boaz.sql', CASE WHEN v3_a AND v3_b THEN 'OK - aplicado' ELSE 'FALTA ejecutar' END FROM c
  UNION ALL SELECT 8, 'servicios_cliente_boaz.sql', CASE WHEN servicios THEN 'OK - aplicado' ELSE 'FALTA ejecutar' END FROM c
  UNION ALL SELECT 9, 'finanzas_conexion_boaz.sql', CASE WHEN finanzas THEN 'OK - aplicado' ELSE 'FALTA ejecutar' END FROM c
  UNION ALL SELECT 10, 'seguridad_6b_paso2_boaz.sql (EL ÚLTIMO, después de probar)', CASE WHEN seg6b2 THEN 'OK - aplicado' ELSE 'Pendiente: ejecutar solo al final' END FROM c
) t ORDER BY orden;
