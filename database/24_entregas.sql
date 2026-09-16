-- =========================================================
-- 24_entregas.sql — Super plan S2 (flujo de entregas)
-- Aplicar UNA vez como superusuario:
--   psql -h localhost -U postgres -d calificaciones_uteq \
--     -f database/24_entregas.sql
--
-- Flujo (inspirado en OpenEducat, adaptado a un solo rol
-- docente + admin): pendiente -> enviada -> aceptada /
-- rechazada / cambios (-> enviada...). El docente tambien
-- puede marcar recibida (entorno real: entrega en fisico).
-- La NOTA sigue viviendo en calificaciones; la entrega
-- registra recepcion/revision, no duplica promedios.
-- Borrado de actividad bloqueado si hay entregas no
-- pendientes o notas (la ruta lo verifica; el FK es CASCADE
-- para limpieza de pendientes huerfanas).
-- =========================================================

SET search_path TO colegio;

CREATE TABLE IF NOT EXISTS entregas (
    id_entrega     SERIAL PRIMARY KEY,
    id_actividad   INTEGER NOT NULL REFERENCES actividades(id_actividad) ON DELETE CASCADE,
    id_estudiante  INTEGER NOT NULL REFERENCES estudiantes(id_estudiante) ON DELETE CASCADE,
    estado         VARCHAR(12) NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente', 'enviada', 'aceptada', 'rechazada', 'cambios')),
    observacion    TEXT,
    fecha_envio    TIMESTAMPTZ,
    fecha_revision TIMESTAMPTZ,
    revisada_por   INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id_actividad, id_estudiante)
);
CREATE INDEX IF NOT EXISTS idx_entregas_actividad
    ON entregas (id_actividad);
CREATE INDEX IF NOT EXISTS idx_entregas_estudiante
    ON entregas (id_estudiante);

DROP TRIGGER IF EXISTS trg_auditoria_entregas ON entregas;
CREATE TRIGGER trg_auditoria_entregas
AFTER INSERT OR UPDATE OR DELETE ON entregas
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_entrega');

-- ---------------------------------------------------------
-- Privilegios minimos (patron migracion 13): la app inserta
-- pendientes al publicar y mueve estados; nunca borra filas
-- directamente (se van en CASCADE con la actividad).
-- ---------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON entregas TO app_uteq;
GRANT USAGE, SELECT ON SEQUENCE entregas_id_entrega_seq TO app_uteq;
