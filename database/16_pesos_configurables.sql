-- =========================================================
-- 16_pesos_configurables.sql — Plan v2 Fase 7 (pesos y minimos
-- configurables, regla de oro: cero constantes en codigo).
-- Aplicar UNA vez:
--   psql -h localhost -U postgres -d calificaciones_uteq -f database/16_pesos_configurables.sql
--
-- PROBLEMA QUE CORRIGE:
--   1. fn_promedio_ciclo tenia 80/20 hardcodeado (0.80/0.20 en
--      09_funciones_formula_oficial.sql:129). Un colegio con otro
--      esquema (p. ej. trimestres con distinto peso de examen)
--      no podia ajustarlo sin editar SQL.
--   2. El minimo de insumos formativos por parcial era siempre 2
--      (DEFAULT de fn_insumos_faltantes), sin forma de pedir mas
--      insumos en materias con mas carga horaria.
--
-- SOLUCION: los pesos viven en ciclos_evaluativos (editables en
-- la pagina Catalogos) y el minimo esperado por materia se
-- deriva de materias.periodos_semanales (periodos pedagogicos
-- semanales del PEI), con piso normativo de 2 (Instructivos
-- MinEduc 2013/2024: minimo 2 insumos formativos por parcial).
-- =========================================================

SET search_path TO colegio;

-- ---------------------------------------------------------
-- 1. Pesos formativa/sumativa POR CICLO (antes: 80/20 fijo).
--    Las filas existentes toman los defaults (0.80/0.20), que
--    suman 1.00 y cumplen el CHECK sin migracion de datos.
-- ---------------------------------------------------------
ALTER TABLE ciclos_evaluativos
    ADD COLUMN IF NOT EXISTS peso_formativa NUMERIC(3,2) NOT NULL DEFAULT 0.80
        CHECK (peso_formativa > 0 AND peso_formativa <= 1),
    ADD COLUMN IF NOT EXISTS peso_sumativa NUMERIC(3,2) NOT NULL DEFAULT 0.20
        CHECK (peso_sumativa >= 0 AND peso_sumativa <= 1);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_ciclo_pesos_suman_uno'
    ) THEN
        ALTER TABLE ciclos_evaluativos
            ADD CONSTRAINT ck_ciclo_pesos_suman_uno
            CHECK (peso_formativa + peso_sumativa = 1);
    END IF;
END $$;

-- ---------------------------------------------------------
-- 2. Periodos pedagogicos semanales POR MATERIA (PEI).
--    NULL = sin definir: se usa el piso normativo (2).
-- ---------------------------------------------------------
ALTER TABLE materias
    ADD COLUMN IF NOT EXISTS periodos_semanales INTEGER
        CHECK (periodos_semanales IS NULL OR periodos_semanales > 0);

-- Minimo de insumos esperado para una materia: lo que el PEI
-- define via periodos semanales, nunca bajo el piso de 2.
CREATE OR REPLACE FUNCTION fn_minimo_insumos_materia(p_materia INTEGER)
RETURNS INTEGER AS $$
DECLARE
    v_horas INTEGER;
BEGIN
    SELECT periodos_semanales INTO v_horas
    FROM materias WHERE id_materia = p_materia;
    RETURN GREATEST(2, COALESCE(v_horas, 2));
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------
-- 3. fn_promedio_ciclo: usa los pesos configurados del ciclo
--    en vez del 80/20 fijo. Misma firma, mismos fallbacks
--    (sin examen -> solo parciales; sin nada -> NULL).
-- ---------------------------------------------------------
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
    -- Pesos configurados del ciclo (Fase 7); si el ciclo no
    -- existe se conservan los historicos 80/20.
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

    -- Examen del ciclo: el informado a este ciclo, o legacy sin ciclo.
    SELECT ROUND(AVG(c.valor), 2) INTO v_examen
    FROM calificaciones c
    JOIN tipos_evaluacion te ON te.id_tipo_evaluacion = c.id_tipo_evaluacion
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

-- La funcion nueva necesita EXECUTE para app_uteq (la 13 otorgo
-- EXECUTE sobre las existentes; el REPLACE conserva grants, pero
-- esta es nueva). El REPLACE de fn_promedio_ciclo conserva el suyo.
GRANT EXECUTE ON FUNCTION fn_minimo_insumos_materia(INTEGER) TO app_uteq;
