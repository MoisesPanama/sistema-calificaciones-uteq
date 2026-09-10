-- =========================================================
-- 17_indices_rendimiento.sql — Plan v2 Fase 8 (indices)
-- Aplicar UNA vez:
--   psql -h localhost -U postgres -d calificaciones_uteq -f database/17_indices_rendimiento.sql
--
-- Cada indice existe por UN patron real de queries del backend
-- (citado abajo). Regla: si un query cambia, revisar si su
-- indice sigue sirviendo antes de agregar otro "por si acaso".
--
-- MEDICION (hacer antes y despues, pegar el resultado en el PR):
--   EXPLAIN (ANALYZE, BUFFERS)
--   SELECT ...;  -- ver bloque de verificacion al final
-- =========================================================

SET search_path TO colegio;

-- 1. Tabla de notas del formulario (contexto + lote):
--    WHERE id_periodo AND id_materia AND id_estudiante = ANY(...)
CREATE INDEX IF NOT EXISTS idx_calif_periodo_materia_est
    ON calificaciones (id_periodo, id_materia, id_estudiante);

-- 2. Promedios por parcial/ciclo (Fase 5/7: fn_promedio_parcial,
--    fn_promedio_ciclo y fn_insumos_faltantes filtran por ahi).
CREATE INDEX IF NOT EXISTS idx_calif_parcial
    ON calificaciones (id_parcial);
CREATE INDEX IF NOT EXISTS idx_calif_ciclo
    ON calificaciones (id_ciclo);

-- 3. Listados por periodo/curso (reportes, consulta, contexto):
--    WHERE m.id_periodo AND m.id_curso
CREATE INDEX IF NOT EXISTS idx_matriculas_periodo_curso
    ON matriculas (id_periodo, id_curso);

-- 4. Promedios por materia (psicologo une por id_materia).
--    (El UNIQUE(id_matricula, id_materia) ya indexa el par;
--    este cubre busquedas solo por materia.)
CREATE INDEX IF NOT EXISTS idx_matricula_materias_materia
    ON matricula_materias (id_materia);

-- 5. Permisos por profesor (helpers/contexto en CADA request
--    de calificaciones: WHERE id_profesor AND id_periodo).
CREATE INDEX IF NOT EXISTS idx_pmp_profesor_periodo
    ON profesor_materia_periodo (id_profesor, id_periodo);

-- 6. Auditoria: resumen por tabla (COUNT/GROUP BY de Fase 3) y
--    detalle ORDER BY fecha_evento DESC con/sin filtro de tabla.
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha
    ON auditoria (fecha_evento DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_tabla_fecha
    ON auditoria (tabla_afectada, fecha_evento DESC);

-- 7. Estudiantes: listado paginado ORDER BY apellidos, nombres
--    (Fase 4) + busqueda ILIKE (para ILIKE con %...% no hay
--    indice B-tree util; si el volumen lo pide, evaluar pg_trgm
--    en una migracion futura, no antes de medir).
CREATE INDEX IF NOT EXISTS idx_estudiantes_apellidos_nombres
    ON estudiantes (apellidos, nombres);

-- ---------------------------------------------------------
-- BLOQUE DE VERIFICACION (correr a mano, no parte de la
-- migracion): ejecutar cada EXPLAIN antes y despues de los
-- CREATE INDEX y comparar Execution Time.
-- ---------------------------------------------------------
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT id_estudiante, id_tipo_evaluacion, valor FROM calificaciones
-- WHERE id_periodo = 1 AND id_materia = 1 AND id_estudiante = ANY('{1,2,3}');
--
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT COUNT(*) FROM matriculas m JOIN estudiantes e USING (id_estudiante)
-- WHERE m.id_periodo = 1 AND m.id_curso = 1;
--
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT tabla_afectada, COUNT(*), MAX(fecha_evento) FROM auditoria
-- WHERE tabla_afectada NOT IN ('matricula_materias','sesiones') GROUP BY 1;
--
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT id_estudiante FROM estudiantes ORDER BY apellidos, nombres LIMIT 20 OFFSET 0;
