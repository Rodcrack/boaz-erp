-- ══════════════════════════════════════════════════════════════════════
-- Boaz ERP · Seguridad 6B · PASO 2 (cierra el acceso anónimo)
-- EJECUTAR SOLO DESPUÉS de: (1) correr el PASO 1, (2) subir el código nuevo
-- (git push) y verificar que Netlify muestre "Published", y (3) probar un
-- login de repartidor y de cliente. Idempotente.
-- ══════════════════════════════════════════════════════════════════════

-- 1) Sin sesión ya no se puede leer ni escribir pedidos, rutas, empresas ni repartidores
DROP POLICY IF EXISTS pedidos_anon_all            ON pedidos;
DROP POLICY IF EXISTS rutas_repartidor_anon_all   ON rutas_repartidor;
DROP POLICY IF EXISTS empresas_anon_select        ON empresas;
DROP POLICY IF EXISTS repartidores_anon_select    ON repartidores;
REVOKE ALL ON pedidos, rutas_repartidor, empresas, repartidores FROM anon;

-- 2) Permisos por módulo también en la base de datos (no solo en pantalla).
--    Usa la tabla roles_permisos que ya administras en "Usuarios y auditoría".
--    El administrador siempre tiene todo.
CREATE OR REPLACE FUNCTION modulo_ok(VARIADIC mods text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.id = auth.uid() AND u.activo = true
      AND (u.rol = 'admin' OR EXISTS (SELECT 1 FROM roles_permisos rp WHERE rp.rol = u.rol AND rp.modulos && mods))
  );
$$;
GRANT EXECUTE ON FUNCTION modulo_ok(text[]) TO authenticated;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('personal_planilla',   ARRAY['planilla','rentabilidad']),
    ('terceros_planilla',   ARRAY['planilla','rentabilidad']),
    ('pagos_planilla',      ARRAY['planilla']),
    ('pagos_terceros',      ARRAY['planilla']),
    ('hijos_planilla',      ARRAY['planilla']),
    ('hijos_terceros',      ARRAY['planilla']),
    ('gastos',              ARRAY['gastos','rentabilidad','reportes','cobranza']),
    ('facturas',            ARRAY['facturacion','cobranza','reportes','rentabilidad','liquidacion-clientes']),
    ('liquidaciones',       ARRAY['liquidaciones','liquidacion-clientes','liquidacion-transporte','reportes','rentabilidad','cobranza']),
    ('liquidacion_pedidos', ARRAY['liquidaciones','liquidacion-clientes','liquidacion-transporte','reportes','rentabilidad','cobranza'])
  ) AS t(tabla, mods)
  LOOP
    IF to_regclass('public.'||r.tabla) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.tabla||'_staff_full', r.tabla);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.tabla||'_por_modulo', r.tabla);
      EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (modulo_ok(VARIADIC %L::text[])) WITH CHECK (modulo_ok(VARIADIC %L::text[]))',
                     r.tabla||'_por_modulo', r.tabla, r.mods, r.mods);
    END IF;
  END LOOP;
END $$;

-- 3) Verificación: debe listar solo cotizaciones (formulario de la web) y lo que no sea sensible.
SELECT tablename, policyname, cmd FROM pg_policies
WHERE schemaname='public' AND 'anon' = ANY(roles) ORDER BY tablename, policyname;
