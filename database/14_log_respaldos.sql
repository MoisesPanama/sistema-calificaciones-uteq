-- =========================================================
-- 14_log_respaldos.sql — Plan v2 Fase 2 (respaldos)
-- Aplicar UNA vez (superusuario no estrictamente necesario,
-- pero recomendado el mismo rol que corre las migraciones):
--   psql -h localhost -U postgres -d calificaciones_uteq -f database/14_log_respaldos.sql
--
-- PROBLEMA QUE CORRIGE: los respaldos (backend/routes/respaldos.js)
-- no dejaban rastro en la BD. Si el cron programado fallaba de
-- noche, nadie se enteraba: solo habia archivos en disco.
--
-- SOLUCION: tabla de log append-only (como auditoria: la app
-- solo hace SELECT + INSERT, nunca UPDATE/DELETE) donde cada
-- ejecucion manual o programada registra fecha, tipo, archivo,
-- tamano, exito/error y quien la disparo (NULL = programado).
-- =========================================================

SET search_path TO colegio;

CREATE TABLE IF NOT EXISTS respaldo_logs (
    id_log        SERIAL PRIMARY KEY,
    fecha         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tipo          VARCHAR(20) NOT NULL DEFAULT 'manual'
                  CHECK (tipo IN ('manual', 'programado')),
    nombre_archivo VARCHAR(255),
    tamano_bytes  BIGINT,
    exito         BOOLEAN NOT NULL DEFAULT TRUE,
    detalle       TEXT,
    id_usuario_app INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL
);

COMMENT ON TABLE respaldo_logs IS
    'Log append-only de respaldos (Fase 2): una fila por ejecucion. NULL en id_usuario_app = disparo programado (cron).';

-- La migracion 13 quito el ALL a app_uteq, asi que esta tabla
-- nueva necesita sus grants explicitos (misma regla que
-- auditoria: la app solo inserta y lee su propio log).
GRANT SELECT, INSERT ON respaldo_logs TO app_uteq;
GRANT USAGE, SELECT ON SEQUENCE respaldo_logs_id_log_seq TO app_uteq;
