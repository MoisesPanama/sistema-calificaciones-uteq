-- =========================================================
-- 02_functions_procedures.sql
-- Funciones, procedimiento almacenado y función con cursor
-- =========================================================

SET search_path TO colegio;

-- ---------------------------------------------------------
-- fn_promedio_materia: promedio ponderado por peso de
-- tipo_evaluacion, para un estudiante en una materia y periodo.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_promedio_materia(
    p_estudiante  INTEGER,
    p_materia     INTEGER,
    p_periodo     INTEGER
) RETURNS NUMERIC(4,2) AS $$
DECLARE
    v_promedio       NUMERIC(4,2);
    v_suma_pesos     NUMERIC(5,2);
BEGIN
    SELECT SUM(c.valor * te.peso), SUM(te.peso)
    INTO v_promedio, v_suma_pesos
    FROM calificaciones c
    JOIN tipos_evaluacion te ON te.id_tipo_evaluacion = c.id_tipo_evaluacion
    WHERE c.id_estudiante = p_estudiante
      AND c.id_materia    = p_materia
      AND c.id_periodo    = p_periodo;

    IF v_promedio IS NULL THEN
        RAISE EXCEPTION 'El estudiante % no tiene calificaciones registradas en la materia % para el periodo %',
            p_estudiante, p_materia, p_periodo;
    END IF;

    RETURN ROUND(v_promedio / v_suma_pesos, 2);
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------
-- fn_promedio_general: promedio de todas las materias
-- cursadas por un estudiante en un periodo.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_promedio_general(
    p_estudiante  INTEGER,
    p_periodo     INTEGER
) RETURNS NUMERIC(4,2) AS $$
DECLARE
    v_materia        RECORD;
    v_promedio_mat   NUMERIC(4,2);
    v_suma           NUMERIC(6,2) := 0;
    v_contador       INTEGER := 0;
BEGIN
    FOR v_materia IN
        SELECT DISTINCT c.id_materia
        FROM calificaciones c
        WHERE c.id_estudiante = p_estudiante
          AND c.id_periodo    = p_periodo
    LOOP
        v_promedio_mat := fn_promedio_materia(p_estudiante, v_materia.id_materia, p_periodo);
        v_suma := v_suma + v_promedio_mat;
        v_contador := v_contador + 1;
    END LOOP;

    IF v_contador = 0 THEN
        RAISE EXCEPTION 'El estudiante % no tiene calificaciones registradas en el periodo %',
            p_estudiante, p_periodo;
    END IF;

    RETURN ROUND(v_suma / v_contador, 2);
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------
-- sp_registrar_calificacion: procedimiento que valida rango
-- 0-10 e inserta o actualiza (upsert) una calificacion.
-- ---------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_registrar_calificacion(
    p_estudiante       INTEGER,
    p_materia          INTEGER,
    p_periodo          INTEGER,
    p_tipo_evaluacion  INTEGER,
    p_valor            NUMERIC(4,2),
    p_usuario          INTEGER
) AS $$
BEGIN
    IF p_valor IS NULL THEN
        RAISE EXCEPTION 'La calificacion no puede ser nula';
    END IF;

    IF p_valor < 0 OR p_valor > 10 THEN
        RAISE EXCEPTION 'La calificacion % esta fuera de rango (0 a 10)', p_valor;
    END IF;

    INSERT INTO calificaciones (
        id_estudiante, id_materia, id_periodo,
        id_tipo_evaluacion, valor, registrado_por
    )
    VALUES (
        p_estudiante, p_materia, p_periodo,
        p_tipo_evaluacion, p_valor, p_usuario
    )
    ON CONFLICT (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion)
    DO UPDATE SET
        valor           = EXCLUDED.valor,
        registrado_por  = EXCLUDED.registrado_por,
        fecha_registro  = NOW();
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------
-- sp_reporte_promedios_periodo: funcion que usa CURSOR
-- explicito para recorrer estudiante por estudiante
-- matriculado en un periodo y devolver su promedio general.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION sp_reporte_promedios_periodo(
    p_periodo  INTEGER
) RETURNS TABLE (
    id_estudiante  INTEGER,
    nombres        VARCHAR,
    apellidos      VARCHAR,
    promedio       NUMERIC(4,2)
) AS $$
DECLARE
    cur_estudiantes CURSOR FOR
        SELECT e.id_estudiante, e.nombres, e.apellidos
        FROM matriculas m
        JOIN estudiantes e ON e.id_estudiante = m.id_estudiante
        WHERE m.id_periodo = p_periodo
        ORDER BY e.apellidos, e.nombres;

    v_estudiante RECORD;
    v_promedio   NUMERIC(4,2);
    v_contador   INTEGER := 0;
BEGIN
    OPEN cur_estudiantes;

    LOOP
        FETCH cur_estudiantes INTO v_estudiante;
        EXIT WHEN NOT FOUND;

        v_contador := v_contador + 1;

        BEGIN
            v_promedio := fn_promedio_general(v_estudiante.id_estudiante, p_periodo);
        EXCEPTION WHEN OTHERS THEN
            v_promedio := NULL;
        END;

        id_estudiante := v_estudiante.id_estudiante;
        nombres       := v_estudiante.nombres;
        apellidos     := v_estudiante.apellidos;
        promedio      := v_promedio;
        RETURN NEXT;
    END LOOP;

    CLOSE cur_estudiantes;

    IF v_contador = 0 THEN
        RAISE EXCEPTION 'No hay estudiantes matriculados en el periodo %', p_periodo;
    END IF;
END;
$$ LANGUAGE plpgsql;