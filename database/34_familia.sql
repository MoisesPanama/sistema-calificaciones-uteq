-- =========================================================
-- 34_familia.sql — Super plan M11 (la familia entra)
-- Aplicar UNA vez como superusuario:
--   psql -h localhost -U postgres -d calificaciones_uteq \
--     -f database/34_familia.sql
--
-- 1. Acudiente con login: representantes.id_usuario ya existe;
--    el aprobar ahora tambien crea su usuario (ver ruta).
-- 2. Un acudiente, N hijos sin duplicarse: cedula unica
--    parcial (solo valores reales) + reutilizacion por
--    documento al aprobar.
-- 3. Ficha basica: salud y contacto de emergencia en
--    estudiantes y en la solicitud (la familia la llena).
-- 4. Clave temporal: usuarios.debe_cambiar_clave (los nuevos
--    entran cambiandola; ver PUT /auth/password).
-- =========================================================

SET search_path TO colegio;

-- ---------------------------------------------------------
-- 2. Cedula unica de representante (solo datos reales)
-- ---------------------------------------------------------
-- Normaliza vacios legacy a NULL y unico parcial (los NULL
-- no compiten: muchos acudientes viejos no tienen documento).
UPDATE representantes SET cedula = NULL WHERE cedula IS NOT NULL AND btrim(cedula) = '';

-- Fusiona duplicados por documento (conserva el que tiene
-- login, si no el menor id; los hijos se reasignan).
WITH keepers AS (
    SELECT cedula,
           COALESCE(MIN(id_representante) FILTER (WHERE id_usuario IS NOT NULL),
                    MIN(id_representante)) AS keeper
    FROM representantes
    WHERE cedula IS NOT NULL AND btrim(cedula) <> ''
    GROUP BY cedula
    HAVING COUNT(*) > 1
)
UPDATE estudiantes e SET id_representante = k.keeper
FROM representantes r JOIN keepers k ON k.cedula = r.cedula
WHERE e.id_representante = r.id_representante
  AND r.id_representante <> k.keeper;

DELETE FROM representantes r USING (
    SELECT cedula,
           COALESCE(MIN(id_representante) FILTER (WHERE id_usuario IS NOT NULL),
                    MIN(id_representante)) AS keeper
    FROM representantes
    WHERE cedula IS NOT NULL AND btrim(cedula) <> ''
    GROUP BY cedula
    HAVING COUNT(*) > 1
) k
WHERE r.cedula = k.cedula AND r.id_representante <> k.keeper;

CREATE UNIQUE INDEX IF NOT EXISTS uq_representante_cedula
    ON representantes (cedula) WHERE cedula IS NOT NULL;

-- ---------------------------------------------------------
-- 3. Ficha basica del estudiante + solicitud
-- ---------------------------------------------------------
ALTER TABLE estudiantes
    ADD COLUMN IF NOT EXISTS grupo_sanguineo VARCHAR(5),
    ADD COLUMN IF NOT EXISTS discapacidad TEXT,
    ADD COLUMN IF NOT EXISTS contacto_emergencia VARCHAR(80),
    ADD COLUMN IF NOT EXISTS tel_emergencia VARCHAR(20);

ALTER TABLE solicitudes_matricula
    ADD COLUMN IF NOT EXISTS grupo_sanguineo VARCHAR(5),
    ADD COLUMN IF NOT EXISTS discapacidad TEXT,
    ADD COLUMN IF NOT EXISTS contacto_emergencia VARCHAR(80),
    ADD COLUMN IF NOT EXISTS tel_emergencia VARCHAR(20);

-- ---------------------------------------------------------
-- 4. Clave temporal obligatoria para usuarios nuevos
-- ---------------------------------------------------------
ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS debe_cambiar_clave BOOLEAN NOT NULL DEFAULT FALSE;
