-- ══════════════════════════════════════════════════════════════
-- COTIZACIONES: solicitudes del formulario "Cotizar ahora" de boaz.com.pe
-- Ejecutar todo de una vez en el SQL Editor de Supabase
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS cotizaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  empresa text,
  email text,
  whatsapp text,
  servicio text,
  volumen text,
  mensaje text,
  estado text NOT NULL DEFAULT 'nueva',   -- nueva | contactada | ganada | perdida
  notas text,
  origen text DEFAULT 'web',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cotizaciones ENABLE ROW LEVEL SECURITY;

-- Personal de Boaz (con sesión del ERP): acceso completo
DROP POLICY IF EXISTS cotizaciones_staff_full ON cotizaciones;
CREATE POLICY cotizaciones_staff_full ON cotizaciones FOR ALL TO authenticated
  USING (es_staff_boaz()) WITH CHECK (es_staff_boaz());

-- La web pública solo puede INSERTAR (nunca leer ni modificar)
DROP POLICY IF EXISTS cotizaciones_web_insert ON cotizaciones;
CREATE POLICY cotizaciones_web_insert ON cotizaciones FOR INSERT TO anon
  WITH CHECK (estado = 'nueva' AND length(nombre) BETWEEN 2 AND 200
              AND coalesce(length(mensaje),0) <= 3000);

REVOKE ALL ON cotizaciones FROM anon;
GRANT INSERT ON cotizaciones TO anon;
GRANT ALL ON cotizaciones TO authenticated;
