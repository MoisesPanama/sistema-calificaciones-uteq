-- =========================================================
-- 23_cierre_notas.sql — Super plan S1 (cierre y estados)
-- Aplicar UNA vez como superusuario:
--   psql -h localhost -U postgres -d calificaciones_uteq \
--     -f database/23_cierre_notas.sql
--
-- PROBLEMAS QUE CORRIGE (verificados contra main):
--   1. Las actividades siempre son editables/calificables
--      (solo tienen `activo`): sin flujo borrador/publicada.
--   2. sp_registrar_calificacion NO valida periodo activo:
--      se puede calificar un periodo finalizado.
--   3. No existe acta que congele notas (OpenEducat valida
--      actas con conteos pass/fail; aqui no hay nada).
--
-- SOLUCION:
--   - actividades.estado: borrador/publicada/cerrada.
--     El SP bloquea calificar CERRADAS; la UI guia a publicar
--     antes de calificar y solo el admin reabre. Reabrir:
--     solo admin.
--   - El SP rechaza periodos no activos y actividades no
--     publicadas, y respeta actas validadas.
--   - Tabla actas: validacion por materia/periodo (+curso,
--     ciclo, parcial opcionales) con validada_por/fecha.
--   - La firma del SP NO cambia (CREATE OR REPLACE conserva
--     los EXECUTE otorgados; sin DROP como en la 22).
-- =========================================================

SET search_path TO colegio;

-- ---------------------------------------------------------
-- 1. Estados de actividad
-- ---------------------------------------------------------
ALTER TABLE actividades
    ADD COLUMN IF NOT EXISTS estado VARCHAR(12) NOT NULL DEFAULT 'borrador'
        CHECK (estado IN ('borrador', 'publicada', 'cerrada'));

-- ---------------------------------------------------------
-- 2. Actas de validacion (congelan un contexto evaluativo)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS actas (
    id_acta        SERIAL PRIMARY KEY,
    id_periodo     INTEGER NOT NULL REFERENCES periodos_academicos(id_periodo) ON DELETE CASCADE,
    id_materia     INTEGER NOT NULL REFERENCES materias(id_materia) ON DELETE RESTRICT,
    id_curso       INTEGER REFERENCES cursos(id_curso) ON DELETE CASCADE,
    id_ciclo       INTEGER REFERENCES ciclos_evaluativos(id_ciclo) ON DELETE CASCADE,
    id_parcial     INTEGER REFERENCES parciales(id_parcial) ON DELETE CASCADE,
    estado         VARCHAR(12) NOT NULL DEFAULT 'borrador'
                   CHECK (estado IN ('borrador', 'validada')),
    validada_por   INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    fecha_validacion TIMESTAMPTZ,
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un acta por contexto (NULL = todo el nivel): no duplicar.
CREATE UNIQUE INDEX IF NOT EXISTS uq_acta_contexto
    ON actas (id_periodo, id_materia,
              COALESCE(id_curso, 0), COALESCE(id_ciclo, 0), COALESCE(id_parcial, 0));

DROP TRIGGER IF EXISTS trg_auditoria_actas ON actas;
CREATE TRIGGER trg_auditoria_actas
AFTER INSERT OR UPDATE OR DELETE ON actas
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_acta');

-- ---------------------------------------------------------
-- 3. fn_acta_bloquea: TRUE si un acta VALIDADA cubre el
--    contexto (misma regla inclusiva de NULLs que el resto
--    del sistema: NULL vale como "todos").
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_acta_bloquea(
    p_periodo  INTEGER,
    p_materia  INTEGER,
    p_curso    INTEGER,
    p_ciclo    INTEGER,
    p_parcial  INTEGER
) RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM actas a
        WHERE a.estado = 'validada'
          AND a.id_periodo = p_periodo
          AND a.id_materia = p_materia
          AND (a.id_curso IS NULL OR p_curso IS NULL OR a.id_curso = p_curso)
          AND (a.id_ciclo IS NULL OR p_ciclo IS NULL OR a.id_ciclo = p_ciclo)
          AND (a.id_parcial IS NULL OR p_parcial IS NULL OR a.id_parcial = p_parcial)
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------
-- 4. SP: misma firma (9 args), +3 validaciones.
--    CREATE OR REPLACE conserva los grants (sin DROP).
-- ---------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_registrar_calificacion(
    p_estudiante       INTEGER,
    p_materia          INTEGER,
    p_periodo          INTEGER,
    p_tipo_evaluacion  INTEGER,
    p_valor            NUMERIC(4,2),
    p_usuario          INTEGER,
    p_parcial          INTEGER DEFAULT NULL,
    p_ciclo            INTEGER DEFAULT NULL,
    p_actividad        INTEGER DEFAULT NULL
) AS $$
DECLARE
    v_mat    INTEGER;
    v_rol    TEXT;
    v_prof   INTEGER;
    v_curso  INTEGER;
    v_ok     INTEGER;
    v_ciclo  INTEGER := p_ciclo;
    v_tipo   INTEGER := p_tipo_evaluacion;
    v_activo BOOLEAN;
    r_act    RECORD;
BEGIN
    IF p_valor IS NULL THEN
        RAISE EXCEPTION 'La calificacion no puede ser nula';
    END IF;

    IF p_valor < 0 OR p_valor > 10 THEN
        RAISE EXCEPTION 'La calificacion % esta fuera de rango (0 a 10)', p_valor;
    END IF;

    -- S1: solo el periodo activo acepta notas.
    SELECT activo INTO v_activo FROM periodos_academicos WHERE id_periodo = p_periodo;
    IF NOT COALESCE(v_activo, FALSE) THEN
        RAISE EXCEPTION 'El periodo % no esta activo: no se pueden registrar notas', p_periodo;
    END IF;

    -- Estudiante matriculado en el periodo
    SELECT id_matricula, id_curso INTO v_mat, v_curso
    FROM matriculas
    WHERE id_estudiante = p_estudiante AND id_periodo = p_periodo;

    IF v_mat IS NULL THEN
        RAISE EXCEPTION 'El estudiante % no esta matriculado en el periodo %', p_estudiante, p_periodo;
    END IF;

    -- Docente asignado (admin libre)
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

    -- Actividad: debe existir, estar activa y PUBLICADA, y
    -- pertenecer a la misma materia y periodo; se heredan
    -- tipo/parcial/ciclo.
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

    -- Deducir ciclo desde el parcial si no vino
    IF v_ciclo IS NULL AND p_parcial IS NOT NULL THEN
        SELECT id_ciclo INTO v_ciclo FROM parciales WHERE id_parcial = p_parcial;
    END IF;

    -- S1: un acta validada congela su contexto.
    IF fn_acta_bloquea(p_periodo, p_materia, v_curso, v_ciclo, p_parcial) THEN
        RAISE EXCEPTION 'Hay un acta validada para este contexto: no se pueden registrar notas';
    END IF;

    IF p_actividad IS NOT NULL THEN
        INSERT INTO calificaciones (
            id_estudiante, id_materia, id_periodo,
            id_tipo_evaluacion, valor, registrado_por, id_parcial, id_ciclo, id_actividad
        )
        VALUES (
            p_estudiante, p_materia, p_periodo,
            v_tipo, p_valor, p_usuario, p_parcial, v_ciclo, p_actividad
        )
        ON CONFLICT (id_estudiante, id_actividad) WHERE id_actividad IS NOT NULL
        DO UPDATE SET
            valor           = EXCLUDED.valor,
            registrado_por  = EXCLUDED.registrado_por,
            fecha_registro  = NOW(),
            id_parcial      = COALESCE(EXCLUDED.id_parcial, calificaciones.id_parcial),
            id_ciclo        = COALESCE(EXCLUDED.id_ciclo, calificaciones.id_ciclo);
    ELSE
        INSERT INTO calificaciones (
            id_estudiante, id_materia, id_periodo,
            id_tipo_evaluacion, valor, registrado_por, id_parcial, id_ciclo
        )
        VALUES (
            p_estudiante, p_materia, p_periodo,
            v_tipo, p_valor, p_usuario, p_parcial, v_ciclo
        )
        ON CONFLICT (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion) WHERE id_actividad IS NULL
        DO UPDATE SET
            valor           = EXCLUDED.valor,
            registrado_por  = EXCLUDED.registrado_por,
            fecha_registro  = NOW(),
            id_parcial      = COALESCE(EXCLUDED.id_parcial, calificaciones.id_parcial),
            id_ciclo        = COALESCE(EXCLUDED.id_ciclo, calificaciones.id_ciclo);
    END IF;

    -- Asegurar detalle de matricula por materia
    INSERT INTO matricula_materias (id_matricula, id_materia, estado)
    VALUES (v_mat, p_materia, 'cursando')
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------
-- 5. Privilegios (patron migracion 13/22): la funcion y la
--    tabla nuevas necesitan grants explicitos para app_uteq.
--    El REPLACE del SP conserva los suyos.
-- ---------------------------------------------------------
GRANT EXECUTE ON FUNCTION fn_acta_bloquea(INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) TO app_uteq;
GRANT SELECT, INSERT, UPDATE, DELETE ON actas TO app_uteq;
GRANT USAGE, SELECT ON SEQUENCE actas_id_acta_seq TO app_uteq;