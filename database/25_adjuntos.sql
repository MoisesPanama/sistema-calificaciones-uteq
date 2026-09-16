-- =========================================================
-- 25_adjuntos.sql — Super plan S3 (archivos)
-- Aplicar UNA vez como superusuario:
--   psql -h localhost -U postgres -d calificaciones_uteq \
--     -f database/25_adjuntos.sql
--
-- Dos usos (patron referencia, adaptado configurable):
--   1. actividad_adjuntos: el docente adjunta material a una
--      actividad (guia en PDF, imagen de apoyo). NO es la nota.
--   2. tipos_documento + estudiante_documentos: checklist de
--      documentos de matricula DEFINIDO POR EL ADMIN (nada
--      hardcodeado a otro pais: cada colegio crea sus tipos).
--
-- SEGURIDAD: los archivos viven en backend/uploads/ (fuera de
-- cualquier carpeta estatica) y SOLO se descargan por rutas
-- con auth + rol. Validacion de tipo/tamano en la ruta.
-- =========================================================

SET search_path TO colegio;

-- ---------------------------------------------------------
-- 1. Adjuntos por actividad
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS actividad_adjuntos (
    id_adjunto       SERIAL PRIMARY KEY,
    id_actividad     INTEGER NOT NULL REFERENCES actividades(id_actividad) ON DELETE CASCADE,
    nombre_original  VARCHAR(255) NOT NULL,
    ruta             VARCHAR(500) NOT NULL,
    mime             VARCHAR(120) NOT NULL,
    tamano_bytes     BIGINT NOT NULL,
    subido_por       INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    fecha_subida     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_adjuntos_actividad
    ON actividad_adjuntos (id_actividad);

DROP TRIGGER IF EXISTS trg_auditoria_adjuntos ON actividad_adjuntos;
CREATE TRIGGER trg_auditoria_adjuntos
AFTER INSERT OR UPDATE OR DELETE ON actividad_adjuntos
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_adjunto');

-- ---------------------------------------------------------
-- 2. Tipos de documento de matricula (los define el admin)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS tipos_documento (
    id_tipo_documento SERIAL PRIMARY KEY,
    nombre            VARCHAR(120) NOT NULL UNIQUE,
    descripcion       TEXT,
    obligatorio       BOOLEAN NOT NULL DEFAULT FALSE,
    activo            BOOLEAN NOT NULL DEFAULT TRUE
);

DROP TRIGGER IF EXISTS trg_auditoria_tipos_documento ON tipos_documento;
CREATE TRIGGER trg_auditoria_tipos_documento
AFTER INSERT OR UPDATE OR DELETE ON tipos_documento
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_tipo_documento');

-- ---------------------------------------------------------
-- 3. Documentos entregados por estudiante (un archivo
--    vigente por tipo; subir de nuevo lo reemplaza)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS estudiante_documentos (
    id_documento     SERIAL PRIMARY KEY,
    id_estudiante    INTEGER NOT NULL REFERENCES estudiantes(id_estudiante) ON DELETE CASCADE,
    id_tipo_documento INTEGER NOT NULL REFERENCES tipos_documento(id_tipo_documento) ON DELETE RESTRICT,
    nombre_original  VARCHAR(255) NOT NULL,
    ruta             VARCHAR(500) NOT NULL,
    mime             VARCHAR(120) NOT NULL,
    tamano_bytes     BIGINT NOT NULL,
    subido_por       INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    fecha_subida     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id_estudiante, id_tipo_documento)
);
CREATE INDEX IF NOT EXISTS idx_estdoc_estudiante
    ON estudiante_documentos (id_estudiante);

DROP TRIGGER IF EXISTS trg_auditoria_estdoc ON estudiante_documentos;
CREATE TRIGGER trg_auditoria_estdoc
AFTER INSERT OR UPDATE OR DELETE ON estudiante_documentos
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_documento');

-- ---------------------------------------------------------
-- 4. Privilegios minimos (patron migracion 13)
-- ---------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON actividad_adjuntos TO app_uteq;
GRANT USAGE, SELECT ON SEQUENCE actividad_adjuntos_id_adjunto_seq TO app_uteq;
GRANT SELECT, INSERT, UPDATE, DELETE ON tipos_documento TO app_uteq;
GRANT USAGE, SELECT ON SEQUENCE tipos_documento_id_tipo_documento_seq TO app_uteq;
GRANT SELECT, INSERT, UPDATE, DELETE ON estudiante_documentos TO app_uteq;
GRANT USAGE, SELECT ON SEQUENCE estudiante_documentos_id_documento_seq TO app_uteq;
