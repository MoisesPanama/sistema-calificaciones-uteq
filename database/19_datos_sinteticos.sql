-- =========================================================
-- 19_datos_sinteticos.sql — ~100 estudiantes de prueba con
-- datos COHERENTES (misma materia/curso asignado).
-- Aplicar UNA vez (es idempotente: ON CONFLICT DO NOTHING y
-- guardas NOT EXISTS, se puede correr dos veces sin duplicar):
--   psql -h localhost -U postgres -d calificaciones_uteq -f database/19_datos_sinteticos.sql
--
-- Supone periodo 1 como periodo de prueba (el activo del seed).
-- Crea: 3 cursos (A/B), asignaciones de Matematicas y Lengua
-- por curso, 100 estudiantes repartidos, matriculas con curso
-- y notas deterministas (sin random(): valor estable entre
-- corridas) SOLO en materias asignadas a su curso.
-- Los bloques Materia+Paralelo de Consulta usan estos datos.
-- =========================================================

SET search_path TO colegio;

-- 1. Cursos del periodo 1 (los que falten; puede haber de otras corridas).
INSERT INTO cursos (nombre, paralelo, id_periodo)
SELECT 'Octavo EGB', x.par, 1
FROM (VALUES ('A'), ('B')) AS x(par)
WHERE NOT EXISTS (
    SELECT 1 FROM cursos WHERE id_periodo = 1 AND nombre = 'Octavo EGB' AND paralelo = x.par
);

-- 1b. Refinar las asignaciones genericas (id_curso NULL = todos los
--     cursos) de Matematicas(1)/Lengua(2) en periodo 1 a asignaciones
--     POR CURSO: el UNIQUE (profesor,materia,periodo) impide duplicar
--     el triple, asi que las genericas se reemplazan.
DELETE FROM profesor_materia_periodo
WHERE id_periodo = 1 AND id_materia IN (1, 2) AND id_curso IS NULL;

-- 2. Asignar Matematicas(1) y Lengua(2) por curso (profes 1 y 2).
--    Los NULL (todos los cursos) de 05 conviven sin problema.
INSERT INTO profesor_materia_periodo (id_profesor, id_materia, id_periodo, id_curso)
SELECT 1, 1, 1, c.id_curso FROM cursos c WHERE c.id_periodo = 1
ON CONFLICT DO NOTHING;
INSERT INTO profesor_materia_periodo (id_profesor, id_materia, id_periodo, id_curso)
SELECT 2, 2, 1, c.id_curso FROM cursos c WHERE c.id_periodo = 1
ON CONFLICT DO NOTHING;

-- 3. 100 estudiantes SINT (cedula con prefijo para identificarlos).
INSERT INTO estudiantes (cedula, nombres, apellidos, fecha_nacimiento, id_representante)
SELECT 'SINT' || LPAD(g::text, 6, '0'),
       'Estudiante' || g,
       'Sintetico' || g,
       DATE '2010-01-01' + ((g * 3) % 1400),
       1 + ((g - 1) % 7)
FROM generate_series(1, 100) AS g
WHERE NOT EXISTS (SELECT 1 FROM estudiantes WHERE cedula LIKE 'SINT%');

-- 4. Matriculas en periodo 1 con curso repartido A/B.
INSERT INTO matriculas (id_estudiante, id_periodo, id_curso)
SELECT e.id_estudiante, 1, c.id_curso
FROM estudiantes e
CROSS JOIN LATERAL (
    SELECT id_curso FROM cursos
    WHERE id_periodo = 1
    ORDER BY id_curso
    LIMIT 1 OFFSET ((e.id_estudiante - 1) % (SELECT COUNT(*) FROM cursos WHERE id_periodo = 1))
) AS c
WHERE e.cedula LIKE 'SINT%'
ON CONFLICT DO NOTHING;

-- 5. Notas deterministas 5.0-9.9 en Matematicas y Lengua
--    (las asignadas a su curso), tipos 1-3.
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por)
SELECT e.id_estudiante, t.id_materia, 1, t.id_tipo, (50 + ((e.id_estudiante * 13 + t.id_tipo * 7 + t.id_materia * 3) % 50)) / 10.0, 1
FROM estudiantes e
CROSS JOIN (VALUES (1, 1), (1, 2), (1, 3), (2, 1), (2, 2), (2, 3)) AS t(id_materia, id_tipo)
WHERE e.cedula LIKE 'SINT%'
ON CONFLICT (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion) DO NOTHING;

-- Verificacion rapida:
--   SELECT COUNT(*) FROM estudiantes WHERE cedula LIKE 'SINT%';  -- 100
--   SELECT c.paralelo, COUNT(*) FROM matriculas m
--   JOIN cursos c ON c.id_curso = m.id_curso GROUP BY 1;
