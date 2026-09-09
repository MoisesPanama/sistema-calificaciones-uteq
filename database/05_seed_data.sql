-- =========================================================
-- 05_seed_data.sql
-- Datos de prueba para poder demostrar el sistema
-- =========================================================

SET search_path TO colegio;

-- Roles de negocio (tabla roles, no roles de PostgreSQL)
INSERT INTO roles (nombre_rol) VALUES
    ('administrador'),
    ('profesor'),
    ('representante');

-- Usuarios (password_hash es un placeholder; se reemplaza
-- por un hash real de bcrypt cuando construyamos el login)
INSERT INTO usuarios (nombres, apellidos, email, password_hash, id_rol) VALUES
    ('Moises', 'Panama', 'admin@uteq.edu.ec', '$2b$10$.9rk4MxOlDi6Jf5KhOrPCOKe77.D.Eytt3uThBTnSCWdsal8U24A.', 1),
    ('Carla', 'Vera', 'carla.vera@uteq.edu.ec', '$2b$10$5ZplphSVBSZonbr8i0ctR.BKbVakXpW0NfLt.PKzHppqTX.SSK6PG', 2),
    ('Jorge', 'Mendoza', 'jorge.mendoza@uteq.edu.ec', '$2b$10$5ZplphSVBSZonbr8i0ctR.BKbVakXpW0NfLt.PKzHppqTX.SSK6PG', 2);

-- Representantes
INSERT INTO representantes (nombres, apellidos, telefono, email) VALUES
    ('Luis', 'Garcia', '0991234567', 'luis.garcia@gmail.com'),
    ('Maria', 'Lopez', '0987654321', 'maria.lopez@gmail.com');

-- Profesores (vinculados a los usuarios con rol "profesor")
INSERT INTO profesores (cedula, nombres, apellidos, especialidad, id_usuario) VALUES
    ('1204567890', 'Carla', 'Vera', 'Matematicas', 2),
    ('1209876543', 'Jorge', 'Mendoza', 'Lengua y Literatura', 3);

-- Estudiantes
INSERT INTO estudiantes (cedula, nombres, apellidos, fecha_nacimiento, id_representante) VALUES
    ('1250001111', 'Ana', 'Garcia', '2010-03-15', 1),
    ('1250002222', 'Pedro', 'Lopez', '2010-07-22', 2),
    ('1250003333', 'Sofia', 'Garcia', '2011-01-09', 1);

-- Materias
INSERT INTO materias (nombre, descripcion) VALUES
    ('Matematicas', 'Algebra y geometria basica'),
    ('Lengua y Literatura', 'Comprension lectora y escritura');

-- Periodos academico (Quimestres)
INSERT INTO periodos_academicos (nombre, fecha_inicio, fecha_fin) VALUES
    ('Primer Quimestre 2026-2027', '2026-09-01', '2027-01-31'),
    ('Segundo Quimestre 2026-2027', '2027-02-01', '2027-06-30');

-- Tipos de evaluacion: 3 parciales por quimestre (pesos suman 1.00)
INSERT INTO tipos_evaluacion (nombre, peso) VALUES
    ('Parcial 1', 0.30),
    ('Parcial 2', 0.30),
    ('Parcial 3', 0.40);

-- Matriculas: los 3 estudiantes en ambos quimestres
INSERT INTO matriculas (id_estudiante, id_periodo) VALUES
    (1, 1), (2, 1), (3, 1),  -- Primer Quimestre
    (1, 2), (2, 2), (3, 2);  -- Segundo Quimestre

-- Asignacion de profesores a materias en ambos quimestres
INSERT INTO profesor_materia_periodo (id_profesor, id_materia, id_periodo) VALUES
    (1, 1, 1), (2, 2, 1),  -- Primer Quimestre
    (1, 1, 2), (2, 2, 2);  -- Segundo Quimestre

-- Calificaciones de prueba (3 parciales por quimestre)
-- Primer Quimestre: Ana Garcia (id=1) - Matematicas (id=1)
CALL sp_registrar_calificacion(1, 1, 1, 1, 8.50, 2);  -- Parcial 1
CALL sp_registrar_calificacion(1, 1, 1, 2, 9.00, 2);  -- Parcial 2
CALL sp_registrar_calificacion(1, 1, 1, 3, 7.75, 2);  -- Parcial 3

-- Pedro Lopez (id=2) - Matematicas (id=1)
CALL sp_registrar_calificacion(2, 1, 1, 1, 6.00, 2);  -- Parcial 1
CALL sp_registrar_calificacion(2, 1, 1, 2, 7.20, 2);  -- Parcial 2
CALL sp_registrar_calificacion(2, 1, 1, 3, 6.80, 2);  -- Parcial 3

-- Ana Garcia (id=1) - Lengua y Literatura (id=2)
CALL sp_registrar_calificacion(1, 2, 1, 1, 9.50, 3);  -- Parcial 1
CALL sp_registrar_calificacion(1, 2, 1, 2, 8.80, 3);  -- Parcial 2
CALL sp_registrar_calificacion(1, 2, 1, 3, 9.20, 3);  -- Parcial 3

-- Sofia Garcia (id=3) - Lengua y Literatura (id=2)
CALL sp_registrar_calificacion(3, 2, 1, 1, 8.00, 3);  -- Parcial 1
CALL sp_registrar_calificacion(3, 2, 1, 2, 7.50, 3);  -- Parcial 2

-- Pedro Lopez (id=2) - Lengua y Literatura (id=2)
CALL sp_registrar_calificacion(2, 2, 1, 1, 7.00, 3);  -- Parcial 1
CALL sp_registrar_calificacion(2, 2, 1, 2, 7.50, 3);  -- Parcial 2
CALL sp_registrar_calificacion(2, 2, 1, 3, 8.00, 3);  -- Parcial 3

-- Sofia (id=3) no tiene calificaciones en Matematicas
-- Sofia solo tiene 2 parciales en Lengua (a proposito para probar)