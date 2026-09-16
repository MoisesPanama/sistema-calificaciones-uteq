-- =========================================================
-- 30_cierre_recuperacion.sql — Super plan M7 (cierre del ciclo)
-- Aplicar UNA vez como superusuario:
--   psql -h localhost -U postgres -d calificaciones_uteq \
--     -f database/30_cierre_recuperacion.sql
--
-- CICLO COMPLETO Ecuador: supletorio -> remedial -> gracia.
--   1. supletorios.instancia (las 3 instancias, UNIQUE por
--      estudiante+materia+periodo+instancia).
--   2. Trigger vivo: promedio <7 escribe 'reprobado' (antes
--      solo el backfill manual de la 11 lo hacia; en vivo
--      quedaba 'cursando' para siempre).
--   3. fn_cerrar_recuperacion: al VALIDAR, cierra el estado
--      de la materia (validada >=7 -> 'aprobado', validada
--      <7 -> 'reprobado'). NO recalcula promedios.
--   4. Acudiente Brayan: parentesco + documento (en
--      solicitudes y representantes) para el lookup por cedula.
--   5. Actividades: fecha_limite opcional (patron OpenEducat:
--      la entrega no puede vencer antes de emitirse).
-- =========================================================

SET search_path TO colegio;

-- ---------------------------------------------------------
-- 1. Instancias de recuperacion
-- ---------------------------------------------------------
ALTER TABLE supletorios
    ADD COLUMN IF NOT EXISTS instancia VARCHAR(12) NOT NULL DEFAULT 'supletorio'
    CHECK (instancia IN ('supletorio', 'remedial', 'gracia'));

ALTER TABLE supletorios
    DROP CONSTRAINT IF EXISTS supletorios_id_estudiante_id_materia_id_periodo_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_supletorio_instancia
    ON supletorios (id_estudiante, id_materia, id_periodo, instancia);

-- ---------------------------------------------------------
-- 2. Trigger vivo: <7 es 'reprobado' (no 'cursando')
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_actualizar_promedio_matricula()
RETURNS TRIGGER AS $$
DECLARE
    v_est INTEGER;
    v_per INTEGER;
    v_mat INTEGER;
    v_det RECORD;
    v_prom NUMERIC(4,2);
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_est := OLD.id_estudiante;
        v_per := OLD.id_periodo;
    ELSE
        v_est := NEW.id_estudiante;
        v_per := NEW.id_periodo;
    END IF;

    SELECT id_matricula INTO v_mat
    FROM matriculas
    WHERE id_estudiante = v_est AND id_periodo = v_per;

    IF v_mat IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    FOR v_det IN
        SELECT id_detalle, id_materia FROM matricula_materias
        WHERE id_matricula = v_mat
    LOOP
        BEGIN
            v_prom := fn_promedio_materia(v_est, v_det.id_materia, v_per);
        EXCEPTION WHEN OTHERS THEN
            v_prom := NULL;
        END;

        UPDATE matricula_materias
        SET promedio = v_prom,
            estado = CASE
                WHEN v_prom IS NULL THEN 'sin_notas'
                WHEN v_prom >= 7 THEN 'aprobado'
                ELSE 'reprobado'
            END
        WHERE id_detalle = v_det.id_detalle;
    END LOOP;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Sincroniza estados historicos con la regla nueva (el trigger
-- solo corre ante cambios futuros en calificaciones).
UPDATE matricula_materias
SET estado = CASE
    WHEN promedio IS NULL THEN 'sin_notas'
    WHEN promedio >= 7 THEN 'aprobado'
    ELSE 'reprobado'
END
WHERE (promedio IS NULL AND estado <> 'sin_notas')
   OR (promedio >= 7 AND estado NOT IN ('aprobado'))
   OR (promedio < 7 AND estado NOT IN ('reprobado'));

-- ---------------------------------------------------------
-- 3. Cierre del ciclo al validar (sin recalcular promedios)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_cerrar_recuperacion(
    p_estudiante INTEGER,
    p_materia    INTEGER,
    p_periodo    INTEGER
) RETURNS TEXT AS $$
DECLARE
    v_matricula INTEGER;
    v_estado    TEXT;
BEGIN
    SELECT m.id_matricula INTO v_matricula
    FROM matriculas m
    WHERE m.id_estudiante = p_estudiante AND m.id_periodo = p_periodo;
    IF v_matricula IS NULL THEN
        RETURN NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM supletorios
               WHERE id_estudiante = p_estudiante AND id_materia = p_materia
                 AND id_periodo = p_periodo AND estado = 'validado' AND nota >= 7) THEN
        v_estado := 'aprobado';
    ELSIF EXISTS (SELECT 1 FROM supletorios
               WHERE id_estudiante = p_estudiante AND id_materia = p_materia
                 AND id_periodo = p_periodo AND estado = 'validado') THEN
        v_estado := 'reprobado';
    ELSE
        RETURN NULL;
    END IF;

    INSERT INTO matricula_materias (id_matricula, id_materia, estado)
    VALUES (v_matricula, p_materia, v_estado)
    ON CONFLICT (id_matricula, id_materia)
    DO UPDATE SET estado = EXCLUDED.estado;
    RETURN v_estado;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION fn_cerrar_recuperacion(INTEGER, INTEGER, INTEGER) TO app_uteq;

-- ---------------------------------------------------------
-- 4. Acudiente: parentesco + documento
-- ---------------------------------------------------------
ALTER TABLE representantes
    ADD COLUMN IF NOT EXISTS parentesco VARCHAR(30),
    ADD COLUMN IF NOT EXISTS cedula VARCHAR(20);

ALTER TABLE solicitudes_matricula
    ADD COLUMN IF NOT EXISTS rep_parentesco VARCHAR(30),
    ADD COLUMN IF NOT EXISTS rep_documento VARCHAR(20);

-- ---------------------------------------------------------
-- 5. Actividades: fecha limite opcional
-- ---------------------------------------------------------
ALTER TABLE actividades
    ADD COLUMN IF NOT EXISTS fecha_limite DATE;
