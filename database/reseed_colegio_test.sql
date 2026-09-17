-- =========================================================
-- reseed_colegio_test.sql — M9: reseed LIMPIO solo para la BD
-- de PRUEBAS (calificaciones_uteq_test). DESTRUCTIVO: borra
-- todos los datos academicos. NO se ejecuta en docker-entrypoint
-- ni en init-db (instalaciones frescas usan 01..32 + seeds).
-- Uso:
--   psql -h localhost -p 5433 -U postgres -d calificaciones_uteq_test \
--     -v ON_ERROR_STOP=1 -f database/reseed_colegio_test.sql
-- Despues:
--   TEST_USER_IDS=1,4,5,6,7,8,9 npm run seed:test-users  (desde backend/)
--
-- Deja: 1 admin, 1 psicologo, 3 profesores (2 con carga), 4
-- materias, 1 periodo activo con ventana abierta, Q1+Q2 con
-- parciales, 5 cursos (8vo A/B, 9no A/B, 10mo A) con nivel y
-- cupo, 62 estudiantes (15+12+14+10+11, con cupo libre) con
-- representantes, actividades publicadas y notas variadas
-- (1 de cada 6 bajo <7 para demo de supletorio), 2 solicitudes
-- pendientes en bandeja y 1 supletorio validado de muestra.
-- Ids estables para los tests: estudiante 1 con notas,
-- estudiante 1 con notas, representante 1 = fernando,
-- materia 1 = Matematicas, tipos 3..9 igual que antes.
-- =========================================================

SET search_path TO colegio;

-- ---------------------------------------------------------
-- 0. Borrado total (se conserva roles y sesiones vivas)
-- ---------------------------------------------------------
TRUNCATE TABLE
    auditoria, respaldo_logs, solicitudes_matricula, supletorios,
    actas, asistencias, entregas, calificaciones, matricula_materias,
    matriculas, estudiante_documentos, actividad_adjuntos, actividades,
    profesor_materia_periodo, parciales, ciclos_evaluativos, cursos,
    tipos_documento, estudiantes, profesores, representantes, usuarios,
    materias, tipos_evaluacion, periodos_academicos
RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------
-- 1. Usuarios fijos (ids estables para seed-test-users)
-- ---------------------------------------------------------
INSERT INTO usuarios (id_usuario, nombres, apellidos, email, password_hash, id_rol) VALUES
    (1, 'Moises', 'Panama', 'admin@uteq.edu.ec', 'PENDING', 1),
    (4, 'Elena', 'Romero', 'elena.romero@uteq.edu.ec', 'PENDING', 2),
    (5, 'Andres', 'Torres', 'andres.torres@uteq.edu.ec', 'PENDING', 2),
    (6, 'Diana', 'Vargas', 'diana.vargas@uteq.edu.ec', 'PENDING', 2),
    (7, 'Fernando', 'Castillo', 'fernando.castillo@uteq.edu.ec', 'PENDING', 3),
    (8, 'Maria', 'Torres', 'maria.torres@uteq.edu.ec', 'PENDING', 4),
    (9, 'Alumno', 'Demo', 'alumno@uteq.edu.ec', 'PENDING', 5);
SELECT setval('usuarios_id_usuario_seq', 9);

INSERT INTO profesores (cedula, nombres, apellidos, especialidad, id_usuario) VALUES
    ('1204567890', 'Elena', 'Romero', 'Matematicas', 4),
    ('1204567891', 'Andres', 'Torres', 'Lengua y Literatura', 5),
    ('1204567892', 'Diana', 'Vargas', 'Tutora', 6);

-- Fernando primero (id_representante = 1, lo usan los tests).
INSERT INTO representantes (nombres, apellidos, telefono, email, parentesco, cedula, id_usuario) VALUES
    ('Fernando', 'Castillo', '0990000007', 'fernando.castillo@uteq.edu.ec', 'padre', '1200000007', 7);

INSERT INTO representantes (nombres, apellidos, telefono, email, parentesco, cedula)
SELECT n, a, '099' || lpad(s::text, 7, '0'), 'acudiente' || s || '@example.com',
       (ARRAY['madre', 'padre', 'representante legal', 'otro familiar'])[1 + ((s - 1) % 4)],
       '12' || lpad(s::text, 8, '0')
FROM (
    SELECT unnest(ARRAY['Lucia', 'Carlos', 'Rosa', 'Miguel', 'Ana', 'Pedro', 'Carmen', 'Jose',
                        'Valeria', 'Diego', 'Paola', 'Jorge', 'Elena', 'Luis', 'Camila', 'Andres',
                        'Sofia', 'Rafael', 'Daniela']) AS n,
           unnest(ARRAY['Mendoza', 'Herrera', 'Aguilar', 'Cedeno', 'Zambrano', 'Vera', 'Mero', 'Ponce',
                        'Santana', 'Moreira', 'Alcivar', 'Sabando', 'Cevallos', 'Bravo', 'Macias', 'Intriago',
                        'Delgado', 'Roldan', 'Pazmino']) AS a,
           generate_series(1, 19) AS s
) r;

-- ---------------------------------------------------------
-- 2. Materias + tipos (ids estables: mat 1 = Matematicas,
--    tipos 3..9 igual que siempre, sin legacies)
-- ---------------------------------------------------------
INSERT INTO materias (id_materia, nombre, descripcion) VALUES
    (1, 'Matematicas', 'Algebra y geometria'),
    (2, 'Lengua y Literatura', 'Comprension lectora y escritura'),
    (3, 'Ciencias Naturales', 'Entorno natural y vivo'),
    (4, 'Estudios Sociales', 'Historia y geografia');
SELECT setval('materias_id_materia_seq', 4);

INSERT INTO tipos_evaluacion
    (id_tipo_evaluacion, nombre, peso, categoria, es_examen, cuenta_para_promedio, orden, es_legacy) VALUES
    (3, 'Examen Final', 1.00, 'sumativa', TRUE, TRUE, 83, FALSE),
    (4, 'Tarea', 1.00, 'formativa', FALSE, TRUE, 30, FALSE),
    (5, 'Leccion', 1.00, 'formativa', FALSE, TRUE, 10, FALSE),
    (6, 'Taller Grupal', 1.00, 'formativa', FALSE, TRUE, 20, FALSE),
    (7, 'Proyecto Interdisciplinar', 1.00, 'sumativa', FALSE, TRUE, 50, FALSE),
    (8, 'Examen Quimestral', 1.00, 'sumativa', TRUE, TRUE, 88, FALSE),
    (9, 'Evaluacion Diagnostica', 1.00, 'diagnostica', FALSE, FALSE, 99, FALSE);
SELECT setval('tipos_evaluacion_id_tipo_evaluacion_seq', 9);

-- ---------------------------------------------------------
-- 3. Periodo activo con ventana de matricula ABIERTA
-- ---------------------------------------------------------
INSERT INTO periodos_academicos
    (nombre, fecha_inicio, fecha_fin, activo, matricula_desde, matricula_hasta) VALUES
    ('2026-2027 Año Lectivo', '2026-09-01', '2027-07-31', TRUE,
     CURRENT_DATE - 30, CURRENT_DATE + 30);

INSERT INTO ciclos_evaluativos (id_periodo, nombre, tipo, orden, peso) VALUES
    (1, 'Quimestre 1', 'quimestre', 1, 0.50),
    (1, 'Quimestre 2', 'quimestre', 2, 0.50);

INSERT INTO parciales (id_ciclo, nombre, orden)
SELECT 1, 'Parcial ' || s, s FROM generate_series(1, 3) s
UNION ALL
SELECT 2, 'Parcial ' || s, s FROM generate_series(1, 3) s;

-- ---------------------------------------------------------
-- 4. Cursos con nivel y cupo (ids estables 1..5)
-- ---------------------------------------------------------
INSERT INTO cursos (id_curso, nombre, paralelo, id_periodo, nivel, cupo_max, id_tutor) VALUES
    (1, 'Octavo EGB', 'A', 1, 8, 20, 1),
    (2, 'Octavo EGB', 'B', 1, 8, 20, 1),
    (3, 'Noveno EGB', 'A', 1, 9, 20, 2),
    (4, 'Noveno EGB', 'B', 1, 9, 15, 2),
    (5, 'Decimo EGB', 'A', 1, 10, 15, 2);
SELECT setval('cursos_id_curso_seq', 5);

-- Asignaciones: elena = Matematicas (8vo A/B, 9no A) + CCNN (8vo A/B);
-- andres = Lengua (8vo A, 9no A, 10mo A) + Sociales (9no A).
INSERT INTO profesor_materia_periodo (id_profesor, id_materia, id_periodo, id_curso) VALUES
    (1, 1, 1, 1), (1, 1, 1, 2), (1, 1, 1, 3),
    (1, 3, 1, 1), (1, 3, 1, 2),
    (2, 2, 1, 1), (2, 2, 1, 3), (2, 2, 1, 5),
    (2, 4, 1, 3);

-- ---------------------------------------------------------
-- 5. Estudiantes (62: 15+12+14+10+11 por curso, con cupo libre)
-- ---------------------------------------------------------
INSERT INTO estudiantes (cedula, nombres, apellidos, fecha_nacimiento, id_representante)
SELECT '10' || lpad(s::text, 8, '0'),
       (ARRAY['Mateo', 'Santiago', 'Matias', 'Sebastian', 'Benjamin', 'Nicolas', 'Alejandro', 'Diego', 'Samuel', 'David',
              'Gabriel', 'Martin', 'Daniel', 'Lucas', 'Thiago', 'Isabella', 'Sofia', 'Valentina', 'Martina', 'Emilia',
              'Catalina', 'Fernanda', 'Antonella', 'Domenica', 'Camila', 'Victoria', 'Amanda', 'Rafaela', 'Salome', 'Paula'])[1 + ((s - 1) % 30)],
       (ARRAY['Garcia', 'Lopez', 'Martinez', 'Sanchez', 'Perez', 'Gomez', 'Rodriguez', 'Fernandez', 'Castro', 'Vargas',
              'Torres', 'Mendoza', 'Herrera', 'Aguilar', 'Cedeno', 'Zambrano', 'Vera', 'Mero', 'Ponce', 'Santana',
              'Moreira', 'Alcivar', 'Sabando', 'Cevallos', 'Bravo', 'Macias', 'Intriago', 'Delgado', 'Roldan', 'Pazmino'])[1 + ((s * 7 - 1) % 30)]
       || ' ' ||
       (ARRAY['Garcia', 'Lopez', 'Martinez', 'Sanchez', 'Perez', 'Gomez', 'Rodriguez', 'Fernandez', 'Castro', 'Vargas',
              'Torres', 'Mendoza', 'Herrera', 'Aguilar', 'Cedeno', 'Zambrano', 'Vera', 'Mero', 'Ponce', 'Santana',
              'Moreira', 'Alcivar', 'Sabando', 'Cevallos', 'Bravo', 'Macias', 'Intriago', 'Delgado', 'Roldan', 'Pazmino'])[1 + ((s * 11 - 1) % 30)],
       DATE '2011-01-05' + ((CASE WHEN s <= 27 THEN 2 WHEN s <= 51 THEN 1 ELSE 0 END) * INTERVAL '1 year') + (((s * 37) % 330) * INTERVAL '1 day'),
       -- fernando (id 1) es apoderado de los estudiantes 2 y 5 (para los tests de representante)
       CASE WHEN s IN (2, 5) THEN 1 ELSE 2 + ((s - 1) % 19) END
FROM generate_series(1, 62) s;

INSERT INTO matriculas (id_estudiante, id_periodo, id_curso)
SELECT e.id_estudiante, 1,
       CASE WHEN s <= 15 THEN 1 WHEN s <= 27 THEN 2 WHEN s <= 41 THEN 3 WHEN s <= 51 THEN 4 ELSE 5 END
FROM estudiantes e
JOIN LATERAL (SELECT (e.cedula::bigint - 1000000000) AS s) q ON TRUE
WHERE e.cedula LIKE '10%';

-- Detalle por materia asignada al curso (el trigger recalcula al calificar).
INSERT INTO matricula_materias (id_matricula, id_materia, estado)
SELECT m.id_matricula, pmp.id_materia, 'sin_notas'
FROM matriculas m
JOIN profesor_materia_periodo pmp ON pmp.id_periodo = m.id_periodo
    AND (pmp.id_curso IS NULL OR pmp.id_curso = m.id_curso OR m.id_curso IS NULL)
ON CONFLICT DO NOTHING;

-- Alumno demo (login alumno@uteq.edu.ec) vinculado al estudiante 6 (<7).
UPDATE estudiantes SET id_usuario = 9 WHERE id_estudiante = 6;

-- ---------------------------------------------------------
-- 6. Actividades publicadas (Q1: 2 insumos x parcial + examen)
-- ---------------------------------------------------------
INSERT INTO actividades
    (id_materia, id_periodo, id_ciclo, id_parcial, id_tipo_evaluacion, nombre, fecha_actividad, estado, creado_por)
SELECT mt.id_materia, 1, 1, p.id_parcial, t.id_tipo,
       t.pref || ' P' || p.orden, CURRENT_DATE - 20 + p.orden, 'publicada', 1
FROM (VALUES (1), (2), (3), (4)) AS mt(id_materia)
CROSS JOIN (SELECT id_parcial, orden FROM parciales WHERE id_ciclo = 1) AS p
CROSS JOIN (VALUES (4, 'Tarea'), (5, 'Leccion')) AS t(id_tipo, pref);

INSERT INTO actividades
    (id_materia, id_periodo, id_ciclo, id_parcial, id_tipo_evaluacion, nombre, fecha_actividad, estado, creado_por)
SELECT id_materia, 1, 1, NULL, 8, 'Examen Quimestral Q1', CURRENT_DATE - 5, 'publicada', 1
FROM (VALUES (1), (2), (3), (4)) AS mt(id_materia);

-- ---------------------------------------------------------
-- 7. Notas variadas (1 de cada 6 estudiantes queda <7 para
--    demo de supletorio; registrado por admin = bypass docente)
-- ---------------------------------------------------------
INSERT INTO calificaciones
    (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor,
     registrado_por, id_parcial, id_ciclo, id_actividad)
SELECT e.id_estudiante, a.id_materia, 1, a.id_tipo_evaluacion,
       LEAST(10, GREATEST(0, ROUND(
           (50 + ((e.id_estudiante * 7 + a.id_actividad * 13) % 45)) / 10.0
           - CASE WHEN e.id_estudiante % 6 = 0 THEN 2.2 ELSE 0 END, 2))),
       1, a.id_parcial, a.id_ciclo, a.id_actividad
FROM estudiantes e
CROSS JOIN actividades a
JOIN matriculas m ON m.id_estudiante = e.id_estudiante AND m.id_periodo = 1
JOIN profesor_materia_periodo pmp ON pmp.id_periodo = 1 AND pmp.id_materia = a.id_materia
    AND (pmp.id_curso IS NULL OR pmp.id_curso = m.id_curso OR m.id_curso IS NULL)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------
-- 8. Demo para revision: 2 solicitudes pendientes en bandeja
--    + 1 supletorio validado de muestra (est 6, <7 en Mat).
-- ---------------------------------------------------------
INSERT INTO solicitudes_matricula
    (nombres, apellidos, cedula, fecha_nacimiento,
     rep_nombres, rep_apellidos, rep_telefono, rep_email,
     rep_parentesco, rep_documento, tipo, id_periodo, id_curso) VALUES
    ('Aspirante', 'Demo Uno', '3099999901', '2013-05-06',
     'Padre', 'Demo Uno', '0990000091', 'demo1@example.com',
     'padre', '1799999901', 'nuevo', 1, 1),
    ('Aspirante', 'Demo Dos', '3099999902', '2013-08-11',
     'Madre', 'Demo Dos', '0990000092', 'demo2@example.com',
     'madre', '1799999902', 'nuevo', 1, 2);

-- Est 6 es del grupo bajo (<7): supletorio validado 7.50.
INSERT INTO supletorios
    (id_estudiante, id_materia, id_periodo, id_curso, nota,
     instancia, estado, creado_por, validado_por, fecha_validacion) VALUES
    (6, 1, 1, 1, 7.50, 'supletorio', 'validado', 1, 1, NOW());

SELECT fn_cerrar_recuperacion(6, 1, 1);
