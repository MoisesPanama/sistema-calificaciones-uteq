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
    ('Moises', 'Panama', 'admin@uteq.edu.ec', 'PENDIENTE_HASH', 1),
    ('Carla', 'Vera', 'carla.vera@uteq.edu.ec', 'PENDIENTE_HASH', 2),
    ('Jorge', 'Mendoza', 'jorge.mendoza@uteq.edu.ec', 'PENDIENTE_HASH', 2);

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

-- Periodo academico
INSERT INTO periodos_academicos (nombre, fecha_inicio, fecha_fin) VALUES
    ('2026-2027 Primer Quimestre', '2026-09-01', '2027-01-31');

-- Tipos de evaluacion (los pesos deben sumar 1.00)
INSERT INTO tipos_evaluacion (nombre, peso) VALUES
    ('Parcial 1', 0.30),
    ('Parcial 2', 0.30),
    ('Examen Final', 0.40);

-- Matriculas: los 3 estudiantes en el periodo
INSERT INTO matriculas (id_estudiante, id_periodo) VALUES
    (1, 1),
    (2, 1),
    (3, 1);

-- Asignacion de profesores a materias en el periodo
INSERT INTO profesor_materia_periodo (id_profesor, id_materia, id_periodo) VALUES
    (1, 1, 1),  -- Carla Vera dicta Matematicas
    (2, 2, 1);  -- Jorge Mendoza dicta Lengua y Literatura

-- Calificaciones de prueba (usando el procedimiento, para que
-- ya pase por la validacion y quede registrado quien las creo)
CALL sp_registrar_calificacion(1, 1, 1, 1, 8.50, 2);  -- Ana, Matematicas, Parcial 1
CALL sp_registrar_calificacion(1, 1, 1, 2, 9.00, 2);  -- Ana, Matematicas, Parcial 2
CALL sp_registrar_calificacion(1, 1, 1, 3, 7.75, 2);  -- Ana, Matematicas, Examen Final

CALL sp_registrar_calificacion(2, 1, 1, 1, 6.00, 2);  -- Pedro, Matematicas, Parcial 1
CALL sp_registrar_calificacion(2, 1, 1, 2, 7.20, 2);  -- Pedro, Matematicas, Parcial 2

CALL sp_registrar_calificacion(1, 2, 1, 1, 9.50, 3);  -- Ana, Lengua, Parcial 1
CALL sp_registrar_calificacion(3, 2, 1, 1, 8.00, 3);  -- Sofia, Lengua, Parcial 1

-- Nota: Sofia (id 3) no tiene calificaciones en Matematicas
-- ni examenes completos en Lengua -- a proposito, para poder
-- probar la excepcion "estudiante sin calificaciones registradas"
-- al pedir su reporte en Matematicas.