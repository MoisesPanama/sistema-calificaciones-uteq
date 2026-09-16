-- =========================================================
-- 22_actividades.sql — Actividades de evaluacion (insumos)
-- Normativa: Instructivo de Evaluacion Estudiantil MinEduc
-- (insumos: lecciones, tareas, talleres, debates, etc.;
--  formativa 70% + sumativa 30%; minimo 2 insumos/parcial).
--
-- El docente CREA actividades (una por cada tarea/leccion/
-- taller/proyecto/examen) y califica SOBRE cada actividad.
-- Los promedios se recalculan solos via trigger existente.
--
-- Compatibilidad: las notas legacy (id_actividad NULL)
-- conservan su grano (est,mat,per,tipo) mediante indice
-- unico parcial; las nuevas usan (est,actividad).
-- Aplicar UNA vez como superusuario:
--   psql -h localhost -U postgres -d calificaciones_uteq \
--     -f database/22_actividades.sql
-- =========================================================

SET search_path TO colegio;

-- ---------------------------------------------------------
-- 1. Tabla de actividades (insumos creados por el docente)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS actividades (
    id_actividad       SERIAL PRIMARY KEY,
    id_materia         INTEGER NOT NULL REFERENCES materias(id_materia) ON DELETE RESTRICT,
    id_periodo         INTEGER NOT NULL REFERENCES periodos_academicos(id_periodo) ON DELETE CASCADE,
    id_ciclo           INTEGER REFERENCES ciclos_evaluativos(id_ciclo) ON DELETE CASCADE,
    id_parcial         INTEGER REFERENCES parciales(id_parcial) ON DELETE CASCADE,
    id_curso           INTEGER REFERENCES cursos(id_curso) ON DELETE SET NULL,
    id_tipo_evaluacion INTEGER NOT NULL REFERENCES tipos_evaluacion(id_tipo_evaluacion) ON DELETE RESTRICT,
    nombre             VARCHAR(120) NOT NULL,
    descripcion        TEXT,
    fecha_actividad    DATE NOT NULL DEFAULT CURRENT_DATE,
    peso               NUMERIC(3,2) NOT NULL DEFAULT 1.00 CHECK (peso > 0 AND peso <= 1),
    creado_por         INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    activo             BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion     TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Una actividad no se repite dentro del mismo parcial/materia.
CREATE UNIQUE INDEX IF NOT EXISTS uq_actividad_nombre
    ON actividades (id_materia, id_periodo, (COALESCE(id_parcial, 0)), nombre);
CREATE INDEX IF NOT EXISTS idx_actividades_contexto
    ON actividades (id_materia, id_periodo, id_parcial);
CREATE INDEX IF NOT EXISTS idx_actividades_curso
    ON actividades (id_curso);

-- ---------------------------------------------------------
-- 2. Notas ligadas a actividad (grano nuevo)
-- ---------------------------------------------------------
ALTER TABLE calificaciones
    ADD COLUMN IF NOT EXISTS id_actividad INTEGER
    REFERENCES actividades(id_actividad) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_calif_actividad
    ON calificaciones (id_actividad);

-- El grano legacy (sin actividad) se reemplaza por dos
-- indices parciales: uno por actividad y otro legacy.
ALTER TABLE calificaciones
    DROP CONSTRAINT IF EXISTS calificaciones_id_estudiante_id_materia_id_periodo_id_tipo__key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_calif_actividad
    ON calificaciones (id_estudiante, id_actividad)
    WHERE id_actividad IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_calif_legacy
    ON calificaciones (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion)
    WHERE id_actividad IS NULL;

-- ---------------------------------------------------------
-- 3. Auditoria de actividades (mismo patron que catalogos)
-- ---------------------------------------------------------
DROP TRIGGER IF EXISTS trg_auditoria_actividades ON actividades;
CREATE TRIGGER trg_auditoria_actividades
AFTER INSERT OR UPDATE OR DELETE ON actividades
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_actividad');

-- ---------------------------------------------------------
-- 4. sp_registrar_calificacion + p_actividad (9o arg, opcional)
-- Los llamados de 8 args siguen funcionando (DEFAULT NULL).
-- Con actividad: valida pertenencia, hereda tipo/parcial/
-- ciclo de la actividad y hace upsert por (est,actividad).
-- ---------------------------------------------------------
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
    p_actividad        INTEGER DEFAULT NULL
) AS $$
DECLARE
    v_mat   INTEGER;
    v_rol   TEXT;
    v_prof  INTEGER;
    v_curso INTEGER;
    v_ok    INTEGER;
    v_ciclo INTEGER := p_ciclo;
    v_tipo  INTEGER := p_tipo_evaluacion;
    r_act   RECORD;
BEGIN
    IF p_valor IS NULL THEN
        RAISE EXCEPTION 'La calificacion no puede ser nula';
    END IF;

    IF p_valor < 0 OR p_valor > 10 THEN
        RAISE EXCEPTION 'La calificacion % esta fuera de rango (0 a 10)', p_valor;
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

    -- Actividad: debe existir, estar activa y pertenecer a la
    -- misma materia y periodo; se heredan tipo/parcial/ciclo.
    IF p_actividad IS NOT NULL THEN
        SELECT id_actividad, id_materia, id_periodo, id_tipo_evaluacion,
               id_parcial, id_ciclo, activo
        INTO r_act
        FROM actividades WHERE id_actividad = p_actividad;

        IF r_act.id_actividad IS NULL THEN
            RAISE EXCEPTION 'La actividad % no existe', p_actividad;
        END IF;
        IF NOT r_act.activo THEN
            RAISE EXCEPTION 'La actividad % esta inactiva', p_actividad;
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

-- Compatibilidad: wrapper de 8 args para llamados existentes
-- (las rutas actuales llaman con 8; el 9o defaults a NULL).
CREATE OR REPLACE PROCEDURE sp_registrar_calificacion(
    p_estudiante       INTEGER,
    p_materia          INTEGER,
    p_periodo          INTEGER,
    p_tipo_evaluacion  INTEGER,
    p_valor            NUMERIC(4,2),
    p_usuario          INTEGER,
    p_parcial          INTEGER,
    p_ciclo            INTEGER
) AS $$
BEGIN
    CALL sp_registrar_calificacion(
        p_estudiante, p_materia, p_periodo, p_tipo_evaluacion,
        p_valor, p_usuario, p_parcial, p_ciclo, NULL);
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------
-- 5. Promedios: la categoria/examen se hereda de la
-- actividad cuando la nota la tiene (fallback al tipo
-- directo para notas legacy). Misma firma, REPLACE simple.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_promedio_parcial(
    p_estudiante  INTEGER,
    p_materia     INTEGER,
    p_periodo     INTEGER,
    p_parcial     INTEGER
) RETURNS NUMERIC(4,2) AS $$
DECLARE
    v_prom NUMERIC(4,2);
BEGIN
    SELECT ROUND(AVG(c.valor), 2) INTO v_prom
    FROM calificaciones c
    LEFT JOIN actividades a ON a.id_actividad = c.id_actividad
    JOIN tipos_evaluacion te
      ON te.id_tipo_evaluacion = COALESCE(a.id_tipo_evaluacion, c.id_tipo_evaluacion)
    WHERE c.id_estudiante = p_estudiante
      AND c.id_materia    = p_materia
      AND c.id_periodo    = p_periodo
      AND te.cuenta_para_promedio = TRUE
      AND te.categoria <> 'diagnostica'
      AND te.es_examen = FALSE
      AND (c.id_parcial = p_parcial OR te.id_parcial = p_parcial);

    RETURN v_prom;
END;
$$ LANGUAGE plpgsql;

-- Examen del ciclo heredando el tipo de la actividad.
-- (fn_promedio_ciclo de la migracion 16 se mantiene; solo
-- se ajusta la lectura del examen. Se redefine completa
-- para no depender del cuerpo anterior.)
CREATE OR REPLACE FUNCTION fn_promedio_ciclo(
    p_estudiante  INTEGER,
    p_materia     INTEGER,
    p_periodo     INTEGER,
    p_ciclo       INTEGER
) RETURNS NUMERIC(4,2) AS $$
DECLARE
    r_par        RECORD;
    v_suma       NUMERIC(6,2) := 0;
    v_n          INTEGER := 0;
    v_avg_parc   NUMERIC(4,2);
    v_parcial    NUMERIC(4,2);
    v_examen     NUMERIC(4,2);
    v_peso_for   NUMERIC(3,2) := 0.80;
    v_peso_sum   NUMERIC(3,2) := 0.20;
BEGIN
    SELECT peso_formativa, peso_sumativa INTO v_peso_for, v_peso_sum
    FROM ciclos_evaluativos WHERE id_ciclo = p_ciclo;
    IF NOT FOUND THEN
        v_peso_for := 0.80;
        v_peso_sum := 0.20;
    END IF;

    FOR r_par IN
        SELECT id_parcial FROM parciales
        WHERE id_ciclo = p_ciclo ORDER BY orden
    LOOP
        v_parcial := fn_promedio_parcial(p_estudiante, p_materia, p_periodo, r_par.id_parcial);
        IF v_parcial IS NOT NULL THEN
            v_suma := v_suma + v_parcial;
            v_n := v_n + 1;
        END IF;
    END LOOP;

    IF v_n > 0 THEN
        v_avg_parc := ROUND(v_suma / v_n, 2);
    END IF;

    SELECT ROUND(AVG(c.valor), 2) INTO v_examen
    FROM calificaciones c
    LEFT JOIN actividades a ON a.id_actividad = c.id_actividad
    JOIN tipos_evaluacion te
      ON te.id_tipo_evaluacion = COALESCE(a.id_tipo_evaluacion, c.id_tipo_evaluacion)
    WHERE c.id_estudiante = p_estudiante
      AND c.id_materia    = p_materia
      AND c.id_periodo    = p_periodo
      AND te.cuenta_para_promedio = TRUE
      AND te.es_examen = TRUE
      AND (c.id_ciclo = p_ciclo OR c.id_ciclo IS NULL);

    IF v_avg_parc IS NOT NULL AND v_examen IS NOT NULL THEN
        RETURN ROUND(v_avg_parc * v_peso_for + v_examen * v_peso_sum, 2);
    ELSIF v_avg_parc IS NOT NULL THEN
        RETURN v_avg_parc;
    ELSIF v_examen IS NOT NULL THEN
        RETURN v_examen;
    ELSE
        RETURN NULL;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------
-- 6. Privilegios minimos para app_uteq (patron migracion 13).
-- NOTA: el DROP+CREATE del SP pierde el EXECUTE otorgado
-- en la 13, por eso se re-otorga aqui explicitamente.
-- ---------------------------------------------------------
GRANT USAGE ON SCHEMA colegio TO app_uteq;
GRANT SELECT, INSERT, UPDATE, DELETE ON actividades TO app_uteq;
GRANT USAGE, SELECT ON SEQUENCE actividades_id_actividad_seq TO app_uteq;
GRANT EXECUTE ON PROCEDURE
    sp_registrar_calificacion(INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER)
    TO app_uteq;
GRANT EXECUTE ON PROCEDURE
    sp_registrar_calificacion(INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, INTEGER, INTEGER, INTEGER)
    TO app_uteq;
