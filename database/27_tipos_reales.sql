-- =========================================================
-- 27_tipos_reales.sql — Super plan M1 (tipos de verdad)
-- Aplicar UNA vez como superusuario:
--   psql -h localhost -U postgres -d calificaciones_uteq \
--     -f database/27_tipos_reales.sql
--
-- PROBLEMA (verificado con Instructivo MinEduc vigente):
--   - "Parcial 1/2" como columnas calificables ESTA MAL: el
--     parcial es un PROMEDIO calculado de insumos, nunca una
--     nota que se digita. Quedan por historial, ocultos.
--   - El orden alfabetico pone EXAMEN antes que las tareas;
--     el examen quimestral va AL ULTIMO (cierra el periodo).
--   - Listas hardcodeadas por id en el codigo ([1,2,3,4,6,9],
--     [3..8]): se rompen si el admin agrega tipos.
--
-- SOLUCION (regla de oro: configurable, no hardcodeado):
--   - orden INTEGER editable (formativas -> examen -> resto).
--   - es_legacy: contenedores viejos fuera de las listas de
--     creacion (sus notas historicas se conservan).
-- Insumos reales MinEduc: tareas, lecciones, talleres
-- (individuales y GRUPALES), exposiciones, proyectos,
-- examen quimestral; diagnostica cualitativa aparte.
-- =========================================================

SET search_path TO colegio;

ALTER TABLE tipos_evaluacion
    ADD COLUMN IF NOT EXISTS orden INTEGER NOT NULL DEFAULT 50,
    ADD COLUMN IF NOT EXISTS es_legacy BOOLEAN NOT NULL DEFAULT FALSE;

-- Legacy: "Parcial N" eran contenedores, no insumos.
UPDATE tipos_evaluacion
SET es_legacy = TRUE
WHERE LOWER(nombre) LIKE 'parcial %';

-- Orden canonico: formativas (10-49) -> sumativas no examen
-- (50-69) -> examenes (80-89) -> legacy (90s) -> resto (50).
WITH o AS (
    SELECT id_tipo_evaluacion,
           10 + 10 * (ROW_NUMBER() OVER (ORDER BY nombre) - 1) AS ord
    FROM tipos_evaluacion
    WHERE categoria = 'formativa' AND NOT es_legacy
)
UPDATE tipos_evaluacion t SET orden = o.ord FROM o
WHERE t.id_tipo_evaluacion = o.id_tipo_evaluacion;

WITH o AS (
    SELECT id_tipo_evaluacion,
           50 + 10 * (ROW_NUMBER() OVER (ORDER BY nombre) - 1) AS ord
    FROM tipos_evaluacion
    WHERE categoria = 'sumativa' AND NOT es_examen AND NOT es_legacy
)
UPDATE tipos_evaluacion t SET orden = o.ord FROM o
WHERE t.id_tipo_evaluacion = o.id_tipo_evaluacion;

UPDATE tipos_evaluacion
SET orden = 80 + (id_tipo_evaluacion % 10)
WHERE es_examen AND NOT es_legacy;

UPDATE tipos_evaluacion SET orden = 90 WHERE es_legacy;
UPDATE tipos_evaluacion SET orden = 99 WHERE categoria = 'diagnostica';

-- Verificacion rapida:
--   SELECT nombre, categoria, es_examen, es_legacy, orden
--   FROM tipos_evaluacion ORDER BY orden;
