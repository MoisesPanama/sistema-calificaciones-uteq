-- =========================================================
-- 08_tipos_matricula_detalle.sql
-- FASE 2: tipos formativa/sumativa (+examen), detalle de
-- matricula por materia con promedio, y regla "una materia
-- en un curso/periodo = un solo profesor".
--
-- Normativa Ecuador (LOEI / Instructivo de Evaluacion):
--   Diagnostica: al inicio, CUALITATIVA, no promedia.
--   Formativa: durante el parcial (tareas, talleres,
--     lecciones, trabajos grupales...). Minimo 2 insumos
--     por parcial. Representa ~70-80% segun nivel.
--   Sumativa: al cierre (proyecto interdisciplinar +
--     evaluacion del periodo/examen quimestral). ~20-30%.
-- =========================================================

SET search_path TO colegio;

-- ---------------------------------------------------------
-- 1. TIPOS DE EVALUACION: categoria + examen + contexto
-- ---------------------------------------------------------
ALTER TABLE tipos_evaluacion
    ADD COLUMN IF NOT EXISTS categoria VARCHAR(20) NOT NULL DEFAULT 'formativa'
        CHECK (categoria IN ('diagnostica','formativa','sumativa')),
    ADD COLUMN IF NOT EXISTS es_examen BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS cuenta_para_promedio BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS id_parcial INTEGER REFERENCES parciales(id_parcial) ON DELETE SET NULL;

-- Clasificar los tipos legacy segun su nombre:
-- Parcial* -> formativa (insumos del parcial)
-- Examen*  -> sumativa + examen quimestral (20%)
UPDATE tipos_evaluacion
SET categoria = 'sumativa',
    es_examen = TRUE
WHERE LOWER(nombre) LIKE '%examen%';

UPDATE tipos_evaluacion
SET categoria = 'formativa',
    es_examen = FALSE,
    cuenta_para_promedio = TRUE
WHERE LOWER(nombre) LIKE '%parcial%';

-- La evaluacion diagnostica nunca promedia (solo retroalimenta).
UPDATE tipos_evaluacion
SET cuenta_para_promedio = FALSE
WHERE categoria = 'diagnostica';

-- Tipos base del modelo oficial (si no existen):
-- Insumos formativos del parcial + examen quimestral sumativo.
-- Los colegios pueden agregar mas (Tarea, Leccion, Taller,
-- Proyecto Interdisciplinar...) sin cambiar codigo.
INSERT INTO tipos_evaluacion (nombre, peso, categoria, es_examen, cuenta_para_promedio)
VALUES
    ('Tarea', 1.00, 'formativa', FALSE, TRUE),
    ('Leccion', 1.00, 'formativa', FALSE, TRUE),
    ('Taller Grupal', 1.00, 'formativa', FALSE, TRUE),
    ('Proyecto Interdisciplinar', 1.00, 'sumativa', FALSE, TRUE),
    ('Examen Quimestral', 1.00, 'sumativa', TRUE, TRUE),
    ('Evaluacion Diagnostica', 1.00, 'diagnostica', FALSE, FALSE)
ON CONFLICT (nombre) DO NOTHING;

-- Vincular tipos legacy "Parcial N" al parcial N del Quimestre 1
-- (solo como referencia inicial; los nuevos registros informan
-- el parcial real al calificar).
DO $$
DECLARE
    r_tipo RECORD;
    v_par  INTEGER;
BEGIN
    FOR r_tipo IN
        SELECT id_tipo_evaluacion, nombre FROM tipos_evaluacion
        WHERE id_parcial IS NULL AND LOWER(nombre) LIKE 'parcial %'
    LOOP
        BEGIN
            v_par := SUBSTRING(r_tipo.nombre FROM '[0-9]+')::INTEGER;
        EXCEPTION WHEN OTHERS THEN
            CONTINUE;
        END;

        UPDATE tipos_evaluacion te SET id_parcial = p.id_parcial
        FROM parciales p
        JOIN ciclos_evaluativos c ON c.id_ciclo = p.id_ciclo
        WHERE te.id_tipo_evaluacion = r_tipo.id_tipo_evaluacion
          AND c.orden = 1 AND p.orden = v_par
        AND NOT EXISTS (
            SELECT 1 FROM tipos_evaluacion x
            WHERE x.id_parcial = p.id_parcial
              AND x.nombre = r_tipo.nombre
              AND x.id_tipo_evaluacion <> r_tipo.id_tipo_evaluacion
        );
    END LOOP;
END
$$;

-- ---------------------------------------------------------
-- 2. DETALLE DE MATRICULA POR MATERIA
-- La tabla "importante de matricula": matricula, estudiante,
-- materia, periodo, promedio y estado. El promedio NUNCA se
-- ingresa a mano: lo recalcula el trigger 08 tras cada nota.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS matricula_materias (
    id_detalle    SERIAL PRIMARY KEY,
    id_matricula  INTEGER NOT NULL REFERENCES matriculas(id_matricula) ON DELETE CASCADE,
    id_materia    INTEGER NOT NULL REFERENCES materias(id_materia) ON DELETE RESTRICT,
    promedio      NUMERIC(4,2) CHECK (promedio IS NULL OR (promedio >= 0 AND promedio <= 10)),
    estado        VARCHAR(20) NOT NULL DEFAULT 'cursando'
                  CHECK (estado IN ('cursando','aprobado','reprobado','sin_notas')),
    UNIQUE (id_matricula, id_materia)
);

-- Backfill: una fila por cada (matricula x materia con notas
-- o materia asignada en el periodo). Idempotente.
INSERT INTO matricula_materias (id_matricula, id_materia, estado)
SELECT m.id_matricula, c.id_materia, 'cursando'
FROM matriculas m
JOIN calificaciones c
  ON c.id_estudiante = m.id_estudiante
 AND c.id_periodo = m.id_periodo
ON CONFLICT DO NOTHING;

INSERT INTO matricula_materias (id_matricula, id_materia, estado)
SELECT m.id_matricula, pmp.id_materia, 'sin_notas'
FROM matriculas m
JOIN profesor_materia_periodo pmp ON pmp.id_periodo = m.id_periodo
  AND (pmp.id_curso IS NULL OR pmp.id_curso = m.id_curso OR m.id_curso IS NULL)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------
-- 3. UNA MATERIA EN UN CURSO/PERIODO = UN SOLO PROFESOR
-- (nadie puede editar la nota de una materia que no dicta)
-- ---------------------------------------------------------
-- Limpieza previa: si legacy tiene 2 profesores en la misma
-- materia+curso+periodo, conservar el de menor id_asignacion.
DO $$
DECLARE
    r_dup RECORD;
BEGIN
    FOR r_dup IN
        SELECT id_materia, id_curso, id_periodo
        FROM profesor_materia_periodo
        WHERE id_curso IS NOT NULL
        GROUP BY id_materia, id_curso, id_periodo
        HAVING COUNT(*) > 1
    LOOP
        DELETE FROM profesor_materia_periodo a
        USING profesor_materia_periodo b
        WHERE a.id_materia = r_dup.id_materia
          AND COALESCE(a.id_curso, -1) = COALESCE(r_dup.id_curso, -1)
          AND a.id_periodo = r_dup.id_periodo
          AND b.id_materia = r_dup.id_materia
          AND COALESCE(b.id_curso, -1) = COALESCE(r_dup.id_curso, -1)
          AND b.id_periodo = r_dup.id_periodo
          AND a.id_asignacion > b.id_asignacion;
    END LOOP;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_profesor_materia_curso_periodo
    ON profesor_materia_periodo (id_materia, id_curso, id_periodo)
    WHERE id_curso IS NOT NULL;

-- ---------------------------------------------------------
-- 4. TRIGGER: validar que quien califica dicte la materia
-- Admin (rol administrador) puede todo; profesor solo sus
-- materias asignadas en ese periodo/curso. Se verifica con
-- registrado_por -> profesores.id_usuario.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validar_profesor_materia()
RETURNS TRIGGER AS $$
DECLARE
    v_rol      TEXT;
    v_profesor INTEGER;
    v_curso    INTEGER;
    v_ok       INTEGER;
BEGIN
    -- Rol del usuario que registra
    SELECT r.nombre_rol INTO v_rol
    FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
    WHERE u.id_usuario = NEW.registrado_por;

    -- Admin: via libre (carga inicial, secretarias, etc.)
    IF v_rol = 'administrador' THEN
        RETURN NEW;
    END IF;

    -- Profesor vinculado al usuario
    SELECT id_profesor INTO v_profesor
    FROM profesores
    WHERE id_usuario = NEW.registrado_por;

    -- Si no es profesor registrado (ej. representante), bloquear
    -- salvo que exista asignacion explicita (que no existira).
    IF v_profesor IS NULL THEN
        RAISE EXCEPTION 'El usuario % no tiene asignacion docente para calificar la materia % en el periodo %',
            NEW.registrado_por, NEW.id_materia, NEW.id_periodo;
    END IF;

    -- Curso del estudiante en el periodo (puede ser NULL en legacy)
    SELECT id_curso INTO v_curso
    FROM matriculas
    WHERE id_estudiante = NEW.id_estudiante
      AND id_periodo = NEW.id_periodo;

    SELECT COUNT(*) INTO v_ok
    FROM profesor_materia_periodo pmp
    WHERE pmp.id_profesor = v_profesor
      AND pmp.id_materia = NEW.id_materia
      AND pmp.id_periodo = NEW.id_periodo
      AND (pmp.id_curso IS NULL OR v_curso IS NULL OR pmp.id_curso = v_curso);

    IF v_ok = 0 THEN
        RAISE EXCEPTION 'El profesor no tiene asignada la materia % en este periodo/curso: no puede registrar la nota', NEW.id_materia;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_profesor_materia ON calificaciones;
CREATE TRIGGER trg_validar_profesor_materia
BEFORE INSERT OR UPDATE ON calificaciones
FOR EACH ROW
EXECUTE FUNCTION fn_validar_profesor_materia();

-- ---------------------------------------------------------
-- 5. TRIGGER: matricula previa obligatoria
-- No se puede calificar a quien no esta matriculado en el periodo.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validar_matricula_calificacion()
RETURNS TRIGGER AS $$
DECLARE
    v_mat INTEGER;
BEGIN
    SELECT id_matricula INTO v_mat
    FROM matriculas
    WHERE id_estudiante = NEW.id_estudiante
      AND id_periodo = NEW.id_periodo;

    IF v_mat IS NULL THEN
        RAISE EXCEPTION 'El estudiante % no esta matriculado en el periodo %', NEW.id_estudiante, NEW.id_periodo;
    END IF;

    -- Auto-crea el detalle por materia si falta (primera nota).
    INSERT INTO matricula_materias (id_matricula, id_materia, estado)
    VALUES (v_mat, NEW.id_materia, 'cursando')
    ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_matricula_calificacion ON calificaciones;
CREATE TRIGGER trg_validar_matricula_calificacion
BEFORE INSERT ON calificaciones
FOR EACH ROW
EXECUTE FUNCTION fn_validar_matricula_calificacion();

-- ---------------------------------------------------------
-- 6. TRIGGER: refrescar promedio + estado del detalle
-- tras cada cambio de notas (el promedio nunca es manual).
-- Usa fn_promedio_materia (reescrita en la migracion 09 con
-- la formula oficial; si aun no existe, tolera NULL).
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
                ELSE 'cursando'
            END
        WHERE id_detalle = v_det.id_detalle;
    END LOOP;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_actualizar_promedio_matricula ON calificaciones;
CREATE TRIGGER trg_actualizar_promedio_matricula
AFTER INSERT OR UPDATE OR DELETE ON calificaciones
FOR EACH ROW
EXECUTE FUNCTION fn_actualizar_promedio_matricula();

-- ---------------------------------------------------------
-- 7. AUDITORIA para las tablas nuevas / ampliadas
-- (reusa fn_auditoria_generica de la migracion 03)
-- ---------------------------------------------------------
DROP TRIGGER IF EXISTS trg_auditoria_matricula_materias ON matricula_materias;
CREATE TRIGGER trg_auditoria_matricula_materias
AFTER INSERT OR UPDATE OR DELETE ON matricula_materias
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_detalle');

DROP TRIGGER IF EXISTS trg_auditoria_asignaciones ON profesor_materia_periodo;
CREATE TRIGGER trg_auditoria_asignaciones
AFTER INSERT OR UPDATE OR DELETE ON profesor_materia_periodo
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_asignacion');

DROP TRIGGER IF EXISTS trg_auditoria_cursos ON cursos;
CREATE TRIGGER trg_auditoria_cursos
AFTER INSERT OR UPDATE OR DELETE ON cursos
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_curso');

DROP TRIGGER IF EXISTS trg_auditoria_ciclos ON ciclos_evaluativos;
CREATE TRIGGER trg_auditoria_ciclos
AFTER INSERT OR UPDATE OR DELETE ON ciclos_evaluativos
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_ciclo');
