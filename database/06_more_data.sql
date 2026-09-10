-- =========================================================
-- 06_more_data.sql
-- Datos adicionales: mas estudiantes, materias, profesores
-- y calificaciones para los 3 quimestres
-- =========================================================

SET search_path TO colegio;

-- Periodos 2 y 3 (05 solo crea el 1 y este seed los necesita para
-- asignaciones/matriculas/notas en "los 3 quimestres").
-- activo=FALSE para respetar el periodo unico activo
-- (uq_periodo_unico_activo): el periodo 1 sigue siendo el actual.
INSERT INTO periodos_academicos (nombre, fecha_inicio, fecha_fin, activo) VALUES
    ('2026-2027 Segundo Quimestre', '2027-02-01', '2027-06-30', FALSE),
    ('2026-2027 Tercer Quimestre', '2027-07-01', '2027-11-30', FALSE);

-- Representantes adicionales (ya hay 2: ids 1-2)
INSERT INTO representantes (nombres, apellidos, telefono, email) VALUES
    ('Carlos', 'Morales', '0991112233', 'carlos.morales@gmail.com'),
    ('Lucia', 'Fernandez', '0984445566', 'lucia.fernandez@gmail.com'),
    ('Roberto', 'Diaz', '0977778899', 'roberto.diaz@gmail.com'),
    ('Patricia', 'Ruiz', '0963334455', 'patricia.ruiz@gmail.com'),
    ('Fernando', 'Castillo', '0956667788', 'fernando.castillo@gmail.com');

-- Usuarios adicionales para profesores (ya hay 3: ids 1-3)
INSERT INTO usuarios (nombres, apellidos, email, password_hash, id_rol) VALUES
    ('Elena', 'Romero', 'elena.romero@uteq.edu.ec', '$2b$10$5ZplphSVBSZonbr8i0ctR.BKbVakXpW0NfLt.PKzHppqTX.SSK6PG', 2),
    ('Andres', 'Torres', 'andres.torres@uteq.edu.ec', '$2b$10$5ZplphSVBSZonbr8i0ctR.BKbVakXpW0NfLt.PKzHppqTX.SSK6PG', 2),
    ('Diana', 'Vargas', 'diana.vargas@uteq.edu.ec', '$2b$10$5ZplphSVBSZonbr8i0ctR.BKbVakXpW0NfLt.PKzHppqTX.SSK6PG', 2);

-- Profesores adicionales (ya hay 2: ids 1-2)
INSERT INTO profesores (cedula, nombres, apellidos, especialidad, id_usuario) VALUES
    ('1211223344', 'Elena', 'Romero', 'Ciencias Naturales', 4),
    ('1255667788', 'Andres', 'Torres', 'Estudios Sociales', 5),
    ('1299887766', 'Diana', 'Vargas', 'Ingles', 6);

-- Estudiantes adicionales (ya hay 3: ids 1-3)
INSERT INTO estudiantes (cedula, nombres, apellidos, fecha_nacimiento, id_representante) VALUES
    ('1250004444', 'Valentina', 'Morales', '2010-05-20', 3),
    ('1250005555', 'Sebastian', 'Fernandez', '2010-11-14', 4),
    ('1250006666', 'Camila', 'Diaz', '2009-08-03', 5),
    ('1250007777', 'Mateo', 'Ruiz', '2010-02-28', 6),
    ('1250008888', 'Isabella', 'Castillo', '2010-06-17', 7),
    ('1250009999', 'Daniel', 'Garcia', '2010-09-25', 1),
    ('1250010000', 'Maria', 'Lopez', '2010-12-10', 2);

-- Materias adicionales (ya hay 3: ids 1-3)
INSERT INTO materias (nombre, descripcion) VALUES
    ('Ciencias Naturales', 'Biologia, quimica y fisica aplicada'),
    ('Estudios Sociales', 'Historia, geografia y ciudadania'),
    ('Ingles', 'Gramatica, conversacion y comprension auditiva'),
    ('Educacion Fisica', 'Deportes, salud y condicion fisica'),
    ('Arte y Cultura', 'Expresion artistica, pintura y musica');

-- Asignacion de profesores a materias en los 3 quimestres
-- Periodo 1 (Q1) y Periodo 2 (Q2) y Periodo 3 (Q3)
-- NOTA: 05 crea 2 materias (1-2) y este archivo agrega 5 (3-7),
-- asi que los ids reales son: 3=Ciencias, 4=Sociales, 5=Ingles,
-- 6=Ed.Fisica, 7=Arte.
-- Profesor 1 (Carla Vera) -> Matematicas (1)
-- Profesor 2 (Jorge Mendoza) -> Lengua y Literatura (2)
-- Profesor 3 (Elena Romero) -> Ciencias Naturales (3)
-- Profesor 4 (Andres Torres) -> Estudios Sociales (4)
-- Profesor 5 (Diana Vargas) -> Ingles (5)
-- Profesor 1 -> tambien Educacion Fisica (6)
-- Profesor 2 -> tambien Arte y Cultura (7)
INSERT INTO profesor_materia_periodo (id_profesor, id_materia, id_periodo) VALUES
    -- Periodo 3
    (1, 1, 3), (2, 2, 3), (3, 3, 3), (4, 4, 3), (5, 5, 3), (1, 6, 3), (2, 7, 3);

-- Matriculas: TODOS los estudiantes en TODOS los 3 periodos
-- 05 solo matricula a 1-3 en el periodo 1, asi que aqui van
-- tambien (1,2),(2,2),(3,2).
INSERT INTO matriculas (id_estudiante, id_periodo) VALUES
    -- Estudiantes 1-3 en Periodo 2 (05 no los incluyo)
    (1, 2), (2, 2), (3, 2),
    -- Estudiantes 1-3 en Periodo 3
    (1, 3), (2, 3), (3, 3),
    -- Estudiante 4 (Valentina) en los 3 periodos
    (4, 1), (4, 2), (4, 3),
    -- Estudiante 5 (Sebastian) en los 3 periodos
    (5, 1), (5, 2), (5, 3),
    -- Estudiante 6 (Camila) en los 3 periodos
    (6, 1), (6, 2), (6, 3),
    -- Estudiante 7 (Mateo) en los 3 periodos
    (7, 1), (7, 2), (7, 3),
    -- Estudiante 8 (Isabella) en los 3 periodos
    (8, 1), (8, 2), (8, 3),
    -- Estudiante 9 (Daniel) en los 3 periodos
    (9, 1), (9, 2), (9, 3),
    -- Estudiante 10 (Maria) en los 3 periodos
    (10, 1), (10, 2), (10, 3);

-- =========================================================
-- CALIFICACIONES PARA PERIODO 1 (Q1)
-- Solo los estudiantes originales 1-3 ya tienen calificaciones
-- Agregamos calificaciones para los nuevos estudiantes 4-10
-- =========================================================

-- Valentina Morales (4) - Matematicas (1)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (4, 1, 1, 1, 7.50, 2), (4, 1, 1, 2, 8.00, 2), (4, 1, 1, 3, 7.80, 2);
-- Valentina Morales (4) - Lengua (2)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (4, 2, 1, 1, 8.20, 3), (4, 2, 1, 2, 7.90, 3), (4, 2, 1, 3, 8.50, 3);

-- Sebastian Fernandez (5) - Matematicas (1)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (5, 1, 1, 1, 5.50, 2), (5, 1, 1, 2, 6.00, 2), (5, 1, 1, 3, 6.50, 2);
-- Sebastian Fernandez (5) - Lengua (2)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (5, 2, 1, 1, 6.80, 3), (5, 2, 1, 2, 7.00, 3), (5, 2, 1, 3, 7.20, 3);

-- Camila Diaz (6) - Matematicas (1)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (6, 1, 1, 1, 9.00, 2), (6, 1, 1, 2, 9.50, 2), (6, 1, 1, 3, 9.20, 2);
-- Camila Diaz (6) - Lengua (2)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (6, 2, 1, 1, 8.80, 3), (6, 2, 1, 2, 9.10, 3), (6, 2, 1, 3, 8.70, 3);

-- Mateo Ruiz (7) - Matematicas (1)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (7, 1, 1, 1, 4.50, 2), (7, 1, 1, 2, 5.00, 2), (7, 1, 1, 3, 5.50, 2);
-- Mateo Ruiz (7) - Lengua (2)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (7, 2, 1, 1, 6.00, 3), (7, 2, 1, 2, 6.50, 3), (7, 2, 1, 3, 7.00, 3);

-- Isabella Castillo (8) - Matematicas (1)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (8, 1, 1, 1, 7.80, 2), (8, 1, 1, 2, 8.20, 2), (8, 1, 1, 3, 8.00, 2);
-- Isabella Castillo (8) - Lengua (2)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (8, 2, 1, 1, 8.50, 3), (8, 2, 1, 2, 8.00, 3), (8, 2, 1, 3, 8.30, 3);

-- Daniel Garcia (9) - Matematicas (1)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (9, 1, 1, 1, 6.50, 2), (9, 1, 1, 2, 7.00, 2), (9, 1, 1, 3, 7.50, 2);
-- Daniel Garcia (9) - Lengua (2)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (9, 2, 1, 1, 7.20, 3), (9, 2, 1, 2, 7.80, 3), (9, 2, 1, 3, 7.50, 3);

-- Maria Lopez (10) - Matematicas (1)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (10, 1, 1, 1, 8.00, 2), (10, 1, 1, 2, 7.50, 2), (10, 1, 1, 3, 8.20, 2);
-- Maria Lopez (10) - Lengua (2)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (10, 2, 1, 1, 7.80, 3), (10, 2, 1, 2, 8.00, 3), (10, 2, 1, 3, 8.50, 3);

-- =========================================================
-- CALIFICACIONES PARA PERIODO 2 (Q2)
-- Algunos registros ya existen, los nuevos son con INSERT IGNORE
-- =========================================================

-- Valentina Morales (4) - Matematicas (1)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (4, 1, 2, 1, 8.00, 2), (4, 1, 2, 2, 8.50, 2), (4, 1, 2, 3, 8.20, 2);
-- Valentina Morales (4) - Lengua (2)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (4, 2, 2, 1, 7.50, 3), (4, 2, 2, 2, 8.00, 3), (4, 2, 2, 3, 7.80, 3);

-- Sebastian Fernandez (5) - Matematicas (1)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (5, 1, 2, 1, 6.00, 2), (5, 1, 2, 2, 6.50, 2), (5, 1, 2, 3, 7.00, 2);
-- Sebastian Fernandez (5) - Lengua (2)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (5, 2, 2, 1, 7.00, 3), (5, 2, 2, 2, 7.50, 3), (5, 2, 2, 3, 7.20, 3);

-- Camila Diaz (6) - Matematicas (1)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (6, 1, 2, 1, 9.20, 2), (6, 1, 2, 2, 9.00, 2), (6, 1, 2, 3, 9.50, 2);
-- Camila Diaz (6) - Lengua (2)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (6, 2, 2, 1, 9.00, 3), (6, 2, 2, 2, 9.30, 3), (6, 2, 2, 3, 9.10, 3);

-- Mateo Ruiz (7) - Matematicas (1)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (7, 1, 2, 1, 5.00, 2), (7, 1, 2, 2, 5.50, 2), (7, 1, 2, 3, 6.00, 2);
-- Mateo Ruiz (7) - Lengua (2)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (7, 2, 2, 1, 6.50, 3), (7, 2, 2, 2, 7.00, 3), (7, 2, 2, 3, 7.20, 3);

-- Isabella Castillo (8) - Matematicas (1)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (8, 1, 2, 1, 8.00, 2), (8, 1, 2, 2, 8.30, 2), (8, 1, 2, 3, 8.50, 2);
-- Isabella Castillo (8) - Lengua (2)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (8, 2, 2, 1, 8.20, 3), (8, 2, 2, 2, 8.00, 3), (8, 2, 2, 3, 8.50, 3);

-- Daniel Garcia (9) - Matematicas (1)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (9, 1, 2, 1, 7.00, 2), (9, 1, 2, 2, 7.50, 2), (9, 1, 2, 3, 7.20, 2);
-- Daniel Garcia (9) - Lengua (2)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (9, 2, 2, 1, 7.50, 3), (9, 2, 2, 2, 8.00, 3), (9, 2, 2, 3, 7.80, 3);

-- Maria Lopez (10) - Matematicas (1)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (10, 1, 2, 1, 7.80, 2), (10, 1, 2, 2, 8.00, 2), (10, 1, 2, 3, 8.30, 2);
-- Maria Lopez (10) - Lengua (2)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (10, 2, 2, 1, 8.00, 3), (10, 2, 2, 2, 8.50, 3), (10, 2, 2, 3, 8.20, 3);

-- Sofia Garcia (3) - Matematicas (1) en Periodo 2
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (3, 1, 2, 1, 8.50, 2), (3, 1, 2, 2, 8.00, 2), (3, 1, 2, 3, 8.80, 2);

-- =========================================================
-- CALIFICACIONES PARA PERIODO 3 (Q3)
-- Todos los estudiantes con calificaciones en Matematicas y Lengua
-- =========================================================

-- Ana Garcia (1) - Matematicas (1)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (1, 1, 3, 1, 8.80, 2), (1, 1, 3, 2, 9.20, 2), (1, 1, 3, 3, 9.00, 2);
-- Ana Garcia (1) - Lengua (2)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (1, 2, 3, 1, 9.00, 3), (1, 2, 3, 2, 9.50, 3), (1, 2, 3, 3, 9.30, 3);

-- Pedro Lopez (2) - Matematicas (1)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (2, 1, 3, 1, 7.00, 2), (2, 1, 3, 2, 7.50, 2), (2, 1, 3, 3, 7.20, 2);
-- Pedro Lopez (2) - Lengua (2)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (2, 2, 3, 1, 7.50, 3), (2, 2, 3, 2, 8.00, 3), (2, 2, 3, 3, 7.80, 3);

-- Sofia Garcia (3) - Matematicas (1)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (3, 1, 3, 1, 8.50, 2), (3, 1, 3, 2, 8.80, 2), (3, 1, 3, 3, 9.00, 2);
-- Sofia Garcia (3) - Lengua (2)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (3, 2, 3, 1, 8.80, 3), (3, 2, 3, 2, 9.00, 3), (3, 2, 3, 3, 8.50, 3);

-- Valentina Morales (4) - Matematicas (1)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (4, 1, 3, 1, 8.00, 2), (4, 1, 3, 2, 8.50, 2), (4, 1, 3, 3, 8.30, 2);
-- Valentina Morales (4) - Lengua (2)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (4, 2, 3, 1, 8.50, 3), (4, 2, 3, 2, 8.00, 3), (4, 2, 3, 3, 8.80, 3);

-- Sebastian Fernandez (5) - Matematicas (1)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (5, 1, 3, 1, 6.50, 2), (5, 1, 3, 2, 7.00, 2), (5, 1, 3, 3, 7.50, 2);
-- Sebastian Fernandez (5) - Lengua (2)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (5, 2, 3, 1, 7.20, 3), (5, 2, 3, 2, 7.50, 3), (5, 2, 3, 3, 7.80, 3);

-- Camila Diaz (6) - Matematicas (1)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (6, 1, 3, 1, 9.00, 2), (6, 1, 3, 2, 9.30, 2), (6, 1, 3, 3, 9.50, 2);
-- Camila Diaz (6) - Lengua (2)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (6, 2, 3, 1, 9.20, 3), (6, 2, 3, 2, 9.00, 3), (6, 2, 3, 3, 9.40, 3);

-- Mateo Ruiz (7) - Matematicas (1)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (7, 1, 3, 1, 5.50, 2), (7, 1, 3, 2, 6.00, 2), (7, 1, 3, 3, 6.50, 2);
-- Mateo Ruiz (7) - Lengua (2)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (7, 2, 3, 1, 6.80, 3), (7, 2, 3, 2, 7.00, 3), (7, 2, 3, 3, 7.50, 3);

-- Isabella Castillo (8) - Matematicas (1)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (8, 1, 3, 1, 8.20, 2), (8, 1, 3, 2, 8.50, 2), (8, 1, 3, 3, 8.80, 2);
-- Isabella Castillo (8) - Lengua (2)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (8, 2, 3, 1, 8.50, 3), (8, 2, 3, 2, 8.20, 3), (8, 2, 3, 3, 8.70, 3);

-- Daniel Garcia (9) - Matematicas (1)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (9, 1, 3, 1, 7.20, 2), (9, 1, 3, 2, 7.50, 2), (9, 1, 3, 3, 7.80, 2);
-- Daniel Garcia (9) - Lengua (2)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (9, 2, 3, 1, 7.80, 3), (9, 2, 3, 2, 8.00, 3), (9, 2, 3, 3, 8.20, 3);

-- Maria Lopez (10) - Matematicas (1)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (10, 1, 3, 1, 8.00, 2), (10, 1, 3, 2, 8.30, 2), (10, 1, 3, 3, 8.50, 2);
-- Maria Lopez (10) - Lengua (2)
INSERT INTO calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por) VALUES
    (10, 2, 3, 1, 8.20, 3), (10, 2, 3, 2, 8.50, 3), (10, 2, 3, 3, 8.00, 3);
