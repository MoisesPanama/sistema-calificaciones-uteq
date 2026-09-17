-- =========================================================
-- 32_matricula_cupos.sql — Super plan M9 (matricula ciega)
-- Aplicar UNA vez como superusuario:
--   psql -h localhost -U postgres -d calificaciones_uteq \
--     -f database/32_matricula_cupos.sql
--
-- Patron OpenEducat (admission_register): ventana de fechas +
-- cupo maximo + orden. Adaptado al modelo propio:
--   1. cursos.nivel (8/9/10...) + cursos.cupo_max (lo pone admin).
--   2. periodos_academicos.matricula_desde/hasta (ventana;
--      NULL = siempre abierto, no rompe historial).
--   3. solicitudes_matricula.tipo (nuevo/rematricula).
--   4. fn_cursos_elegibles(cedula, periodo): nuevo -> nivel
--      inicial con cupo; existente -> todo aprobado sube de
--      nivel, si algo no aprobado repite nivel (todo-o-nada).
--      Solo cursos con disponibles > 0 (matriculados +
--      pendientes en tramite ocupan cupo).
--   5. fn_matricula_abierta(periodo): ventana vigente hoy.
-- =========================================================

SET search_path TO colegio;

-- ---------------------------------------------------------
-- 1. Nivel + cupo por curso
-- ---------------------------------------------------------
ALTER TABLE cursos
    ADD COLUMN IF NOT EXISTS nivel SMALLINT CHECK (nivel IS NULL OR (nivel >= 1 AND nivel <= 12)),
    ADD COLUMN IF NOT EXISTS cupo_max INTEGER NOT NULL DEFAULT 30 CHECK (cupo_max > 0);

-- ---------------------------------------------------------
-- 2. Ventana de matriculacion por periodo
-- ---------------------------------------------------------
ALTER TABLE periodos_academicos
    ADD COLUMN IF NOT EXISTS matricula_desde DATE,
    ADD COLUMN IF NOT EXISTS matricula_hasta DATE;

-- BUG CRUO (M9): activo DEFAULT TRUE + indice unico parcial
-- uq_periodo_unico_activo = imposible crear un segundo periodo
-- (todo INSERT nuevo chocaba con el activo). El admin activa
-- explicito con POST /:id/activar; lo nuevo nace inactivo.
ALTER TABLE periodos_academicos
    ALTER COLUMN activo SET DEFAULT FALSE;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_periodo_ventana_matricula') THEN
        ALTER TABLE periodos_academicos
            ADD CONSTRAINT ck_periodo_ventana_matricula
            CHECK (matricula_hasta IS NULL OR matricula_desde IS NULL OR matricula_hasta >= matricula_desde);
    END IF;
END
$$;

-- ---------------------------------------------------------
-- 3. Tipo de solicitud
-- ---------------------------------------------------------
ALTER TABLE solicitudes_matricula
    ADD COLUMN IF NOT EXISTS tipo VARCHAR(12) NOT NULL DEFAULT 'nuevo'
    CHECK (tipo IN ('nuevo', 'rematricula'));

-- ---------------------------------------------------------
-- 4. Ventana vigente
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_matricula_abierta(p_periodo INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    v_desde DATE;
    v_hasta DATE;
BEGIN
    SELECT matricula_desde, matricula_hasta INTO v_desde, v_hasta
    FROM periodos_academicos WHERE id_periodo = p_periodo;
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    IF v_desde IS NOT NULL AND CURRENT_DATE < v_desde THEN
        RETURN FALSE;
    END IF;
    IF v_hasta IS NOT NULL AND CURRENT_DATE > v_hasta THEN
        RETURN FALSE;
    END IF;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------
-- 5. Ocupacion y elegibles (ocupan cupo: matriculados +
--    solicitudes pendientes del mismo periodo/curso)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_ocupacion_curso(p_curso INTEGER, p_periodo INTEGER)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::int FROM matriculas m
        WHERE m.id_curso = p_curso AND m.id_periodo = p_periodo
    ) + (
        SELECT COUNT(*)::int FROM solicitudes_matricula s
        WHERE s.id_curso = p_curso AND s.id_periodo = p_periodo
          AND s.estado = 'pendiente'
    );
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION fn_cursos_elegibles(p_cedula TEXT, p_periodo INTEGER)
RETURNS TABLE (
    id_curso     INTEGER,
    nombre       VARCHAR,
    paralelo     VARCHAR,
    nivel        SMALLINT,
    cupo_max     INTEGER,
    ocupados     INTEGER,
    disponibles  INTEGER
) AS $$
DECLARE
    v_est        INTEGER;
    v_last_per   INTEGER;
    v_last_nivel SMALLINT;
    v_falla      BOOLEAN;
    v_objetivo   SMALLINT;
BEGIN
    SELECT e.id_estudiante INTO v_est
    FROM estudiantes e WHERE e.cedula = p_cedula;

    IF v_est IS NULL THEN
        -- Nuevo: nivel inicial del periodo (minimo con cupo).
        SELECT MIN(c.nivel) INTO v_objetivo
        FROM cursos c WHERE c.id_periodo = p_periodo AND c.nivel IS NOT NULL;
    ELSE
        -- Ultima matricula (periodo mas reciente por fecha_inicio).
        SELECT m.id_periodo INTO v_last_per
        FROM matriculas m
        JOIN periodos_academicos p ON p.id_periodo = m.id_periodo
        WHERE m.id_estudiante = v_est
        ORDER BY p.fecha_inicio DESC, m.id_matricula DESC
        LIMIT 1;

        IF v_last_per IS NULL THEN
            SELECT MIN(c.nivel) INTO v_objetivo
            FROM cursos c WHERE c.id_periodo = p_periodo AND c.nivel IS NOT NULL;
        ELSE
            SELECT c.nivel INTO v_last_nivel
            FROM matriculas m
            LEFT JOIN cursos c ON c.id_curso = m.id_curso
            WHERE m.id_estudiante = v_est AND m.id_periodo = v_last_per;

            -- Todo-o-nada: si algo no esta aprobado, repite nivel.
            SELECT EXISTS (
                SELECT 1
                FROM matriculas m
                JOIN matricula_materias mm ON mm.id_matricula = m.id_matricula
                WHERE m.id_estudiante = v_est AND m.id_periodo = v_last_per
                  AND mm.estado IS DISTINCT FROM 'aprobado'
            ) INTO v_falla;

            IF v_last_nivel IS NULL THEN
                SELECT MIN(c.nivel) INTO v_objetivo
                FROM cursos c WHERE c.id_periodo = p_periodo AND c.nivel IS NOT NULL;
            ELSIF v_falla THEN
                v_objetivo := v_last_nivel;
            ELSE
                v_objetivo := v_last_nivel + 1;
            END IF;
        END IF;
    END IF;

    IF v_objetivo IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT c.id_curso, c.nombre, c.paralelo, c.nivel, c.cupo_max,
           fn_ocupacion_curso(c.id_curso, p_periodo) AS ocup,
           (c.cupo_max - fn_ocupacion_curso(c.id_curso, p_periodo)) AS disp
    FROM cursos c
    WHERE c.id_periodo = p_periodo AND c.nivel = v_objetivo
      AND (c.cupo_max - fn_ocupacion_curso(c.id_curso, p_periodo)) > 0
    ORDER BY c.nombre, c.paralelo;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION fn_matricula_abierta(INTEGER) TO app_uteq;
GRANT EXECUTE ON FUNCTION fn_ocupacion_curso(INTEGER, INTEGER) TO app_uteq;
GRANT EXECUTE ON FUNCTION fn_cursos_elegibles(TEXT, INTEGER) TO app_uteq;
