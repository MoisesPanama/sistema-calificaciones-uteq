-- =========================================================
-- 31_notas_coherentes.sql — Super plan M8 (una sola verdad)
-- Aplicar UNA vez como superusuario:
--   psql -h localhost -U postgres -d calificaciones_uteq \
--     -f database/31_notas_coherentes.sql
--
-- PROBLEMA: /api/reportes calculaba el promedio a mano
-- (ponderado por pesos muertos, sin 80/20, con diagnosticas
-- y legacies) mientras consulta/boletin usan fn oficial:
-- dos numeros distintos para el mismo estudiante.
-- SOLUCION:
--   1. fn_promedio_reporte = alias estricto de la oficial
--      (propaga P0001 si no hay notas, igual que consulta).
--   2. v_estado_final: promedio + estado + instancia validada
--      por estudiante/materia/periodo (lo que muestran
--      consulta, boletin y supletorio).
-- =========================================================

SET search_path TO colegio;

-- ---------------------------------------------------------
-- 1. Alias oficial para reportes (una sola verdad)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_promedio_reporte(
    p_estudiante INTEGER,
    p_materia    INTEGER,
    p_periodo    INTEGER
) RETURNS NUMERIC AS $$
BEGIN
    RETURN fn_promedio_materia(p_estudiante, p_materia, p_periodo);
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION fn_promedio_reporte(INTEGER, INTEGER, INTEGER) TO app_uteq;

-- ---------------------------------------------------------
-- 1b. Version tolerante (NULL si no hay notas): permite
-- calcular la nomina en UNA sola query en vez de N llamadas
-- secuenciales (la pagina de supletorio tardaba ~45s).
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_promedio_materia_safe(
    p_estudiante INTEGER,
    p_materia    INTEGER,
    p_periodo    INTEGER
) RETURNS NUMERIC AS $$
BEGIN
    RETURN fn_promedio_materia(p_estudiante, p_materia, p_periodo);
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION fn_promedio_materia_safe(INTEGER, INTEGER, INTEGER) TO app_uteq;

-- ---------------------------------------------------------
-- 2. Vista de estado final (lee matricula_materias que el
--    trigger mantiene + la instancia validada mas alta:
--    gracia > remedial > supletorio).
-- ---------------------------------------------------------
CREATE OR REPLACE VIEW v_estado_final AS
SELECT m.id_estudiante,
       mm.id_materia,
       m.id_periodo,
       mm.promedio AS promedio_anual,
       mm.estado AS estado_materia,
       (SELECT s.instancia
        FROM supletorios s
        WHERE s.id_estudiante = m.id_estudiante
          AND s.id_materia = mm.id_materia
          AND s.id_periodo = m.id_periodo
          AND s.estado = 'validado'
        ORDER BY CASE s.instancia
                     WHEN 'gracia' THEN 3
                     WHEN 'remedial' THEN 2
                     ELSE 1 END DESC
        LIMIT 1) AS instancia_validada,
       (SELECT s.nota
        FROM supletorios s
        WHERE s.id_estudiante = m.id_estudiante
          AND s.id_materia = mm.id_materia
          AND s.id_periodo = m.id_periodo
          AND s.estado = 'validado'
        ORDER BY CASE s.instancia
                     WHEN 'gracia' THEN 3
                     WHEN 'remedial' THEN 2
                     ELSE 1 END DESC
        LIMIT 1) AS nota_recuperacion
FROM matriculas m
JOIN matricula_materias mm ON mm.id_matricula = m.id_matricula;

GRANT SELECT ON v_estado_final TO app_uteq;
