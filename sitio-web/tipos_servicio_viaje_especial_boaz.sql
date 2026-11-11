-- Agrega "Por Viaje" y "Especial" a las dos líneas de negocio. Idempotente.
INSERT INTO tipos_servicio (linea_negocio_id, codigo, nombre, unidad_medida)
SELECT id, 'TC-VIA', 'Por Viaje', 'viaje' FROM lineas_negocio WHERE codigo='LOG-TC'
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO tipos_servicio (linea_negocio_id, codigo, nombre, unidad_medida)
SELECT id, 'TC-ESP', 'Servicio Especial (cotizado)', 'servicio' FROM lineas_negocio WHERE codigo='LOG-TC'
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO tipos_servicio (linea_negocio_id, codigo, nombre, unidad_medida)
SELECT id, 'UM-VIA', 'Por Viaje / Recojo', 'viaje' FROM lineas_negocio WHERE codigo='LOG-UM'
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO tipos_servicio (linea_negocio_id, codigo, nombre, unidad_medida)
SELECT id, 'UM-ESP', 'Servicio Especial (cotizado)', 'servicio' FROM lineas_negocio WHERE codigo='LOG-UM'
ON CONFLICT (codigo) DO NOTHING;

SELECT l.codigo linea, t.codigo, t.nombre, t.unidad_medida
FROM tipos_servicio t JOIN lineas_negocio l ON l.id=t.linea_negocio_id ORDER BY 1,2;
