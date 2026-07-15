-- =========================================================
-- 06_sesiones.sql
-- Tabla tecnica para guardar sesiones de Express en Postgres
-- Estructura requerida por la libreria connect-pg-simple
-- =========================================================

SET search_path TO colegio;

CREATE TABLE sesiones (
    sid     VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
    sess    JSON NOT NULL,
    expire  TIMESTAMP(6) NOT NULL
);

CREATE INDEX idx_sesiones_expire ON sesiones (expire);

-- Esta tabla le da acceso completo al usuario de la app,
-- ya cubierto por rol_admin, pero lo dejamos explicito
-- porque connect-pg-simple hace INSERT/UPDATE/DELETE aqui
-- constantemente y no queremos que dependa de la auditoria
-- ni de ningun trigger (no lleva).
GRANT ALL PRIVILEGES ON sesiones TO rol_admin;