-- =========================================================
-- 28_preinscripciones.sql — Super plan M3 (auto-matricula)
-- Aplicar UNA vez como superusuario:
--   psql -h localhost -U postgres -d calificaciones_uteq \
--     -f database/28_preinscripciones.sql
--
-- La familia se preinscribe SOLA (sin login), como en la
-- referencia: datos del aspirante + acudiente + curso +
-- PDF opcional. Queda PENDIENTE hasta que el admin la
-- APRUEBA (crea representante/usuario/estudiante/matricula)
-- o la RECHAZA con motivo. La pagina interna de Matriculas
-- sigue existiendo para gestion directa del admin.
-- =========================================================

SET search_path TO colegio;

CREATE TABLE IF NOT EXISTS solicitudes_matricula (
    id_solicitud     SERIAL PRIMARY KEY,
    nombres          VARCHAR(80) NOT NULL,
    apellidos        VARCHAR(80) NOT NULL,
    cedula           VARCHAR(20) NOT NULL,
    fecha_nacimiento DATE NOT NULL,
    rep_nombres      VARCHAR(80) NOT NULL,
    rep_apellidos    VARCHAR(80) NOT NULL,
    rep_telefono     VARCHAR(20),
    rep_email        VARCHAR(120),
    id_periodo       INTEGER NOT NULL REFERENCES periodos_academicos(id_periodo) ON DELETE CASCADE,
    id_curso         INTEGER REFERENCES cursos(id_curso) ON DELETE SET NULL,
    documento_nombre VARCHAR(255),
    documento_ruta   VARCHAR(500),
    documento_mime   VARCHAR(120),
    documento_tamano BIGINT,
    estado           VARCHAR(12) NOT NULL DEFAULT 'pendiente'
                     CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
    motivo_rechazo   TEXT,
    revisada_por     INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    fecha_revision   TIMESTAMPTZ,
    fecha_creacion   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (cedula, id_periodo)
);
CREATE INDEX IF NOT EXISTS idx_solicitudes_estado
    ON solicitudes_matricula (estado, fecha_creacion DESC);

DROP TRIGGER IF EXISTS trg_auditoria_solicitudes ON solicitudes_matricula;
CREATE TRIGGER trg_auditoria_solicitudes
AFTER INSERT OR UPDATE OR DELETE ON solicitudes_matricula
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_solicitud');

-- La app inserta (publico), revisa (admin) y el trigger
-- audita: necesita el juego completo menos... (se otorga
-- todo menos TRUNCATE, que nunca se concede).
GRANT SELECT, INSERT, UPDATE, DELETE ON solicitudes_matricula TO app_uteq;
GRANT USAGE, SELECT ON SEQUENCE solicitudes_matricula_id_solicitud_seq TO app_uteq;
