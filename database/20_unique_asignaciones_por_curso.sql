-- =========================================================
-- 20_unique_asignaciones_por_curso.sql — permite que un profesor
-- dicte la misma materia en VARIOS paralelos (el admin decide
-- cuantas materias/cursos toma cada profesor).
-- Aplicar UNA vez:
--   psql -h localhost -U postgres -d calificaciones_uteq -f database/20_unique_asignaciones_por_curso.sql
--
-- PROBLEMA: la 01_schema creo UNIQUE (id_profesor, id_materia,
-- id_periodo), que impide repetir el triple aunque sea en otro
-- paralelo. Eso contradice la 08 (cuyo indice parcial ya regula
-- "una materia en un curso/periodo = un solo profesor") y el
-- flujo real (un profesor con Matematicas en A y B).
--
-- SOLUCION: se elimina el UNIQUE global y se reemplaza por uno
-- parcial solo para filas SIN curso (NULL = "todos los cursos",
-- que sigue siendo unico por profesor/materia/periodo). Las filas
-- CON curso las regula el indice de la 08 (un profesor por
-- materia/curso/periodo) mas este: un profesor no se duplica en
-- el mismo curso.
-- =========================================================

SET search_path TO colegio;

ALTER TABLE profesor_materia_periodo
    DROP CONSTRAINT IF EXISTS profesor_materia_periodo_id_profesor_id_materia_id_periodo_key;

-- Sin curso (general): sigue unico por profesor/materia/periodo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pmp_general_sin_curso
    ON profesor_materia_periodo (id_profesor, id_materia, id_periodo)
    WHERE id_curso IS NULL;

-- Con curso: un profesor no repite materia en el mismo paralelo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pmp_profesor_materia_curso
    ON profesor_materia_periodo (id_profesor, id_materia, id_curso, id_periodo)
    WHERE id_curso IS NOT NULL;
