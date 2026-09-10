-- =========================================================
-- 10_usuarios_roles_especiales.sql
-- Crea usuarios para profesores, representante y psicologo
-- Contraseña para todos: UTEQ2026
-- =========================================================

-- 1. Agregar rol psicologo si no existe
INSERT INTO roles (nombre_rol) VALUES ('psicologo')
ON CONFLICT (nombre_rol) DO NOTHING;

-- 2. Agregar columna id_usuario a representantes si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'colegio' AND table_name = 'representantes' AND column_name = 'id_usuario'
    ) THEN
        ALTER TABLE colegio.representantes ADD COLUMN id_usuario INTEGER REFERENCES usuarios(id_usuario);
    END IF;
END $$;

-- 3. Crear usuarios profesores (ya existen en usuarios ids 4 y 5, solo actualizar hash)
UPDATE usuarios SET password_hash = '$2b$10$4dBx37/copPLn1CFbmWPIeUxoUsKAdVW.piJdR8gPzTIPPU2HEaW2'
WHERE email IN ('elena.romero@uteq.edu.ec', 'andres.torres@uteq.edu.ec');

-- 4. Crear usuario representante (padre de Isabella Castillo, id_representante=7)
-- Primero crear el usuario
INSERT INTO usuarios (nombres, apellidos, email, password_hash, id_rol) VALUES
    ('Fernando', 'Castillo', 'fernando.castillo@uteq.edu.ec', '$2b$10$4dBx37/copPLn1CFbmWPIeUxoUsKAdVW.piJdR8gPzTIPPU2HEaW2', 3)
ON CONFLICT (email) DO NOTHING;

-- Vincular representante con usuario
UPDATE representantes SET id_usuario = (
    SELECT id_usuario FROM usuarios WHERE email = 'fernando.castillo@uteq.edu.ec'
) WHERE id_representante = 7;

-- 5. Crear usuario psicologo
INSERT INTO usuarios (nombres, apellidos, email, password_hash, id_rol) VALUES
    ('Maria', 'Torres', 'maria.torres@uteq.edu.ec', '$2b$10$4dBx37/copPLn1CFbmWPIeUxoUsKAdVW.piJdR8gPzTIPPU2HEaW2', 4)
ON CONFLICT (email) DO NOTHING;

-- 6. Asignar materias a los profesores para el periodo activo
-- Elena Romero (profesor 3) -> Ciencias Naturales
INSERT INTO profesor_materia_periodo (id_profesor, id_materia, id_periodo)
SELECT 3, m.id_materia, p.id_periodo
FROM materias m, periodos_academicos p
WHERE m.nombre = 'Ciencias Naturales' AND p.activo = TRUE
ON CONFLICT DO NOTHING;

-- Andres Torres (profesor 4) -> Estudios Sociales
INSERT INTO profesor_materia_periodo (id_profesor, id_materia, id_periodo)
SELECT 4, m.id_materia, p.id_periodo
FROM materias m, periodos_academicos p
WHERE m.nombre = 'Estudios Sociales' AND p.activo = TRUE
ON CONFLICT DO NOTHING;
