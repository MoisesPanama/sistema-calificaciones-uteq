-- =========================================================
-- 26_fallas_observaciones.sql — Super plan S4
-- Aplicar UNA vez como superusuario:
--   psql -h localhost -U postgres -d calificaciones_uteq \
--     -f database/26_fallas_observaciones.sql
--
-- 1. calificaciones.observacion: comentario del docente sobre
--    esa nota (aparece en consulta y boletin). Se escribe por
--    el endpoint individual (la planilla masiva sigue numerica).
-- 2. asistencias: UNA fila por falta (presencia se asume).
--    UNIQUE evita duplicar el mismo dia.
-- =========================================================

SET search_path TO colegio;

ALTER TABLE calificaciones
    ADD COLUMN IF NOT EXISTS observacion TEXT;

CREATE TABLE IF NOT EXISTS asistencias (
    id_asistencia  SERIAL PRIMARY KEY,
    id_estudiante  INTEGER NOT NULL REFERENCES estudiantes(id_estudiante) ON DELETE CASCADE,
    id_materia     INTEGER NOT NULL REFERENCES materias(id_materia) ON DELETE RESTRICT,
    id_periodo     INTEGER NOT NULL REFERENCES periodos_academicos(id_periodo) ON DELETE CASCADE,
    fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
    motivo         VARCHAR(12) NOT NULL DEFAULT 'falta'
                   CHECK (motivo IN ('falta', 'justificada')),
    registrado_por INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    fecha_registro TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id_estudiante, id_materia, id_periodo, fecha)
);
CREATE INDEX IF NOT EXISTS idx_asistencias_estudiante
    ON asistencias (id_estudiante, id_periodo);

DROP TRIGGER IF EXISTS trg_auditoria_asistencias ON asistencias;
CREATE TRIGGER trg_auditoria_asistencias
AFTER INSERT OR UPDATE OR DELETE ON asistencias
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_asistencia');

GRANT SELECT, INSERT, UPDATE, DELETE ON asistencias TO app_uteq;
GRANT USAGE, SELECT ON SEQUENCE asistencias_id_asistencia_seq TO app_uteq;

-- ---------------------------------------------------------
-- SP: 10o parametro p_observacion (DEFAULT NULL).
-- Se recrea desde cero (DROP+CREATE como en la 22) con las
-- 3 validaciones S1 intactas; la observacion viaja en ambos
-- upserts. Llamados de 8/9 args siguen funcionando por el
-- DEFAULT. Re-grant explicito (el DROP pierde el EXECUTE).
-- ---------------------------------------------------------
DROP PROCEDURE IF EXISTS
    sp_registrar_calificacion(INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER);
DROP PROCEDURE IF EXISTS
    sp_registrar_calificacion(INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, INTEGER, INTEGER, INTEGER);

CREATE PROCEDURE sp_registrar_calificacion(
    p_estudiante       INTEGER,
    p_materia          INTEGER,
    p_periodo          INTEGER,
    p_tipo_evaluacion  INTEGER,
    p_valor            NUMERIC(4,2),
    p_usuario          INTEGER,
    p_parcial          INTEGER DEFAULT NULL,
    p_ciclo            INTEGER DEFAULT NULL,
    p_actividad        INTEGER DEFAULT NULL,
    p_observacion      TEXT DEFAULT NULL
) AS $$
DECLARE
    v_mat   INTEGER;
    v_rol   TEXT;
    v_prof  INTEGER;
    v_curso INTEGER;
    v_ok    INTEGER;
    v_ciclo INTEGER := p_ciclo;
    v_tipo  INTEGER := p_tipo_evaluacion;
    v_activo BOOLEAN;
    r_act   RECORD;
BEGIN
    IF p_valor IS NULL THEN
        RAISE EXCEPTION 'La calificacion no puede ser nula';
    END IF;

    IF p_valor < 0 OR p_valor > 10 THEN
        RAISE EXCEPTION 'La calificacion % esta fuera de rango (0 a 10)', p_valor;
    END IF;

    SELECT activo INTO v_activo FROM periodos_academicos WHERE id_periodo = p_periodo;
    IF NOT COALESCE(v_activo, FALSE) THEN
        RAISE EXCEPTION 'El periodo % no esta activo: no se pueden registrar notas', p_periodo;
    END IF;

    SELECT id_matricula, id_curso INTO v_mat, v_curso
    FROM matriculas
    WHERE id_estudiante = p_estudiante AND id_periodo = p_periodo;

    IF v_mat IS NULL THEN
        RAISE EXCEPTION 'El estudiante % no esta matriculado en el periodo %', p_estudiante, p_periodo;
    END IF;

    SELECT r.nombre_rol INTO v_rol
    FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
    WHERE u.id_usuario = p_usuario;

    IF v_rol IS NOT NULL AND v_rol <> 'administrador' THEN
        SELECT id_profesor INTO v_prof FROM profesores WHERE id_usuario = p_usuario;

        SELECT COUNT(*) INTO v_ok
        FROM profesor_materia_periodo pmp
        WHERE pmp.id_profesor = v_prof
          AND pmp.id_materia = p_materia
          AND pmp.id_periodo = p_periodo
          AND (pmp.id_curso IS NULL OR v_curso IS NULL OR pmp.id_curso = v_curso);

        IF COALESCE(v_ok, 0) = 0 THEN
            RAISE EXCEPTION 'El profesor no tiene asignada la materia % en este periodo/curso: no puede registrar la nota', p_materia;
        END IF;
    END IF;

    IF p_actividad IS NOT NULL THEN
        SELECT id_actividad, id_materia, id_periodo, id_tipo_evaluacion,
               id_parcial, id_ciclo, activo, estado
        INTO r_act
        FROM actividades WHERE id_actividad = p_actividad;

        IF r_act.id_actividad IS NULL THEN
            RAISE EXCEPTION 'La actividad % no existe', p_actividad;
        END IF;
        IF NOT r_act.activo THEN
            RAISE EXCEPTION 'La actividad % esta inactiva', p_actividad;
        END IF;
        IF r_act.estado = 'cerrada' THEN
            RAISE EXCEPTION 'La actividad % esta cerrada: no admite mas notas', p_actividad;
        END IF;
        IF r_act.id_materia <> p_materia OR r_act.id_periodo <> p_periodo THEN
            RAISE EXCEPTION 'La actividad % no pertenece a esta materia/periodo', p_actividad;
        END IF;
        v_tipo := r_act.id_tipo_evaluacion;
        IF p_parcial IS NULL THEN
            p_parcial := r_act.id_parcial;
        ELSIF r_act.id_parcial IS NOT NULL AND r_act.id_parcial <> p_parcial THEN
            RAISE EXCEPTION 'El parcial no coincide con el de la actividad %', p_actividad;
        END IF;
        IF v_ciclo IS NULL THEN
            v_ciclo := r_act.id_ciclo;
        END IF;
    END IF;

    IF v_ciclo IS NULL AND p_parcial IS NOT NULL THEN
        SELECT id_ciclo INTO v_ciclo FROM parciales WHERE id_parcial = p_parcial;
    END IF;

    IF fn_acta_bloquea(p_periodo, p_materia, v_curso, v_ciclo, p_parcial) THEN
        RAISE EXCEPTION 'Hay un acta validada para este contexto: no se pueden registrar notas';
    END IF;

    IF p_actividad IS NOT NULL THEN
        INSERT INTO calificaciones (
            id_estudiante, id_materia, id_periodo,
            id_tipo_evaluacion, valor, registrado_por, id_parcial, id_ciclo, id_actividad, observacion
        )
        VALUES (
            p_estudiante, p_materia, p_periodo,
            v_tipo, p_valor, p_usuario, p_parcial, v_ciclo, p_actividad, p_observacion
        )
        ON CONFLICT (id_estudiante, id_actividad) WHERE id_actividad IS NOT NULL
        DO UPDATE SET
            valor           = EXCLUDED.valor,
            registrado_por  = EXCLUDED.registrado_por,
            fecha_registro  = NOW(),
            observacion     = COALESCE(EXCLUDED.observacion, calificaciones.observacion),
            id_parcial      = COALESCE(EXCLUDED.id_parcial, calificaciones.id_parcial),
            id_ciclo        = COALESCE(EXCLUDED.id_ciclo, calificaciones.id_ciclo);
    ELSE
        INSERT INTO calificaciones (
            id_estudiante, id_materia, id_periodo,
            id_tipo_evaluacion, valor, registrado_por, id_parcial, id_ciclo, observacion
        )
        VALUES (
            p_estudiante, p_materia, p_periodo,
            v_tipo, p_valor, p_usuario, p_parcial, v_ciclo, p_observacion
        )
        ON CONFLICT (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion) WHERE id_actividad IS NULL
        DO UPDATE SET
            valor           = EXCLUDED.valor,
            registrado_por  = EXCLUDED.registrado_por,
            fecha_registro  = NOW(),
            observacion     = COALESCE(EXCLUDED.observacion, calificaciones.observacion),
            id_parcial      = COALESCE(EXCLUDED.id_parcial, calificaciones.id_parcial),
            id_ciclo        = COALESCE(EXCLUDED.id_ciclo, calificaciones.id_ciclo);
    END IF;

    INSERT INTO matricula_materias (id_matricula, id_materia, estado)
    VALUES (v_mat, p_materia, 'cursando')
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON PROCEDURE
    sp_registrar_calificacion(INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER, TEXT)
    TO app_uteq;
