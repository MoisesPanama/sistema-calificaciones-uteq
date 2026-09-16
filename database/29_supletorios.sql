-- =========================================================
-- 29_supletorios.sql — Super plan M4 (supletorio acta simple)
-- Aplicar UNA vez como superusuario:
--   psql -h localhost -U postgres -d calificaciones_uteq \
--     -f database/29_supletorios.sql
--
-- NORMA Ecuador: aprueba con 7. El <7 va a supletorio.
-- El supletorio NO recalcula el promedio anual (acta simple):
-- registra la nota del examen de recuperacion por materia y
-- se congela al VALIDAR (mismo motor de estados que actas:
-- registrado -> validado, solo admin valida, validado no se
-- edita ni se borra). Solo se permite si el promedio anual
-- del estudiante en la materia es < 7 (verificado en la API
-- con fn_promedio_materia, nunca en el navegador).
-- =========================================================

SET search_path TO colegio;

CREATE TABLE IF NOT EXISTS supletorios (
    id_supletorio  SERIAL PRIMARY KEY,
    id_estudiante  INTEGER NOT NULL REFERENCES estudiantes(id_estudiante) ON DELETE CASCADE,
    id_materia     INTEGER NOT NULL REFERENCES materias(id_materia) ON DELETE RESTRICT,
    id_periodo     INTEGER NOT NULL REFERENCES periodos_academicos(id_periodo) ON DELETE CASCADE,
    id_curso       INTEGER REFERENCES cursos(id_curso) ON DELETE SET NULL,
    nota           NUMERIC(4,2) NOT NULL CHECK (nota >= 0 AND nota <= 10),
    estado         VARCHAR(12) NOT NULL DEFAULT 'registrado'
                   CHECK (estado IN ('registrado', 'validado')),
    creado_por     INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    validado_por   INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    fecha_validacion TIMESTAMPTZ,
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id_estudiante, id_materia, id_periodo)
);
CREATE INDEX IF NOT EXISTS idx_supletorios_periodo_materia
    ON supletorios (id_periodo, id_materia, id_curso);
CREATE INDEX IF NOT EXISTS idx_supletorios_estudiante
    ON supletorios (id_estudiante, id_periodo);

DROP TRIGGER IF EXISTS trg_auditoria_supletorios ON supletorios;
CREATE TRIGGER trg_auditoria_supletorios
AFTER INSERT OR UPDATE OR DELETE ON supletorios
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_supletorio');

-- La app lista (todos los autenticados), registra (docente
-- asignado o admin) y valida (solo admin); el trigger audita.
GRANT SELECT, INSERT, UPDATE, DELETE ON supletorios TO app_uteq;
GRANT USAGE, SELECT ON SEQUENCE supletorios_id_supletorio_seq TO app_uteq;
