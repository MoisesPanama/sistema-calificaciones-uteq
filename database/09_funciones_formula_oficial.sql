-- =========================================================
-- 09_funciones_formula_oficial.sql
-- FASE 3: promedios con formula oficial Ecuador + reporte
-- por curso/materia con CURSOR + control de minimo de insumos.
--
-- Formula oficial (Instructivo de Evaluacion Estudiantil):
--   Parcial  = promedio de insumos formativos del parcial
--              (minimo 2 insumos por parcial).
--   Quimestre/ciclo = 80% promedio de parciales
--                     + 20% examen quimestral.
--   Anual    = promedio de ciclos (ponderado por peso).
--   Aprueba  con >= 7.00 (sin redondeo, 2 decimales).
-- Escala: 9-10 Domina, 7-8.99 Alcanza, 4.01-6.99 Proximo,
--         <= 4 No alcanza.
--
-- COMPATIBILIDAD: si el periodo aun no usa parciales/ciclos
-- (datos legacy), se aplica la formula ponderada anterior.
-- =========================================================

SET search_path TO colegio;

-- Contexto de ciclo en la nota (el examen quimestral cuelga
-- del ciclo, no de un parcial puntual).
ALTER TABLE calificaciones
    ADD COLUMN IF NOT EXISTS id_ciclo INTEGER REFERENCES ciclos_evaluativos(id_ciclo) ON DELETE SET NULL;

-- Backfill: deducir ciclo desde el parcial informado.
UPDATE calificaciones c
SET id_ciclo = p.id_ciclo
FROM parciales p
WHERE c.id_parcial = p.id_parcial
  AND c.id_ciclo IS NULL;

-- ---------------------------------------------------------
-- Escala cualitativa oficial
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_escala_cualitativa(p_nota NUMERIC)
RETURNS TEXT AS $$
BEGIN
    IF p_nota IS NULL THEN
        RETURN 'Sin notas';
    ELSIF p_nota >= 9 THEN
        RETURN 'Domina los aprendizajes requeridos';
    ELSIF p_nota >= 7 THEN
        RETURN 'Alcanza los aprendizajes requeridos';
    ELSIF p_nota > 4 THEN
        RETURN 'Esta proximo a alcanzar los aprendizajes requeridos';
    ELSE
        RETURN 'No alcanza los aprendizajes requeridos';
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ---------------------------------------------------------
-- Promedio de UN parcial: media de insumos formativos que
-- cuentan para promedio (diagnosticas excluidas).
-- Devuelve NULL si no hay insumos (tolerante).
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
    JOIN tipos_evaluacion te ON te.id_tipo_evaluacion = c.id_tipo_evaluacion
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

-- ---------------------------------------------------------
-- Promedio de UN ciclo (quimestre/trimestre/bimestre):
-- 80% promedio de parciales + 20% examen del ciclo.
-- Sin examen -> solo parciales. Sin nada -> NULL.
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
BEGIN
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
        RETURN ROUND(v_avg_parc * 0.80 + v_examen * 0.20, 2);
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
-- fn_promedio_materia (MISMA FIRMA): ahora oficial.
-- Recorre los ciclos del periodo y pondera por peso.
-- Si el periodo no usa ciclos/notas nuevas, usa la formula
-- ponderada legacy para no romper datos existentes.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_promedio_materia(
    p_estudiante  INTEGER,
    p_materia     INTEGER,
    p_periodo     INTEGER
) RETURNS NUMERIC(4,2) AS $$
DECLARE
    r_ciclo      RECORD;
    v_ciclo      NUMERIC(4,2);
    v_suma       NUMERIC(7,2) := 0;
    v_pesos      NUMERIC(5,2) := 0;
    v_legacy     NUMERIC(4,2);
    v_legacy_pes NUMERIC(5,2);
BEGIN
    FOR r_ciclo IN
        SELECT id_ciclo, peso FROM ciclos_evaluativos
        WHERE id_periodo = p_periodo ORDER BY orden
    LOOP
        v_ciclo := fn_promedio_ciclo(p_estudiante, p_materia, p_periodo, r_ciclo.id_ciclo);
        IF v_ciclo IS NOT NULL THEN
            v_suma := v_suma + v_ciclo * r_ciclo.peso;
            v_pesos := v_pesos + r_ciclo.peso;
        END IF;
    END LOOP;

    IF v_pesos > 0 THEN
        RETURN ROUND(v_suma / v_pesos, 2);
    END IF;

    -- Fallback legacy: ponderado por peso de tipo_evaluacion
    SELECT SUM(c.valor * te.peso), SUM(te.peso)
    INTO v_legacy, v_legacy_pes
    FROM calificaciones c
    JOIN tipos_evaluacion te ON te.id_tipo_evaluacion = c.id_tipo_evaluacion
    WHERE c.id_estudiante = p_estudiante
      AND c.id_materia    = p_materia
      AND c.id_periodo    = p_periodo;

    IF v_legacy IS NULL THEN
        RAISE EXCEPTION 'El estudiante % no tiene calificaciones registradas en la materia % para el periodo %',
            p_estudiante, p_materia, p_periodo;
    END IF;

    RETURN ROUND(v_legacy / v_legacy_pes, 2);
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------
-- fn_promedio_general: sin cambios de firma; usa la nueva
-- fn_promedio_materia (media aritmetica entre materias).
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
-- Minimo de insumos: la normativa pide MINIMO 2 insumos
-- formativos por parcial. Devuelve faltantes por parcial.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_insumos_faltantes(
    p_estudiante  INTEGER,
    p_materia     INTEGER,
    p_periodo     INTEGER,
    p_minimo      INTEGER DEFAULT 2
) RETURNS TABLE (
    parcial       TEXT,
    ciclo         TEXT,
    n_insumos     INTEGER,
    minimo        INTEGER,
    faltan        INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.nombre::TEXT AS parcial,
        c.nombre::TEXT AS ciclo,
        COUNT(cali.id_calificacion)::INTEGER AS n_insumos,
        p_minimo AS minimo,
        GREATEST(0, p_minimo - COUNT(cali.id_calificacion)::INTEGER) AS faltan
    FROM parciales p
    JOIN ciclos_evaluativos c ON c.id_ciclo = p.id_ciclo
    LEFT JOIN calificaciones cali
      ON (cali.id_parcial = p.id_parcial
          OR (cali.id_parcial IS NULL
              AND cali.id_tipo_evaluacion IN (
                  SELECT t.id_tipo_evaluacion FROM tipos_evaluacion t
                  WHERE t.id_parcial = p.id_parcial)))
     AND cali.id_estudiante = p_estudiante
     AND cali.id_materia = p_materia
     AND cali.id_periodo = p_periodo
     AND cali.id_calificacion IN (
         SELECT cc.id_calificacion FROM calificaciones cc
         JOIN tipos_evaluacion tt ON tt.id_tipo_evaluacion = cc.id_tipo_evaluacion
         WHERE tt.cuenta_para_promedio = TRUE
           AND tt.categoria = 'formativa'
           AND tt.es_examen = FALSE
     )
    WHERE c.id_periodo = p_periodo
    GROUP BY p.nombre, c.nombre, p.orden, c.orden
    ORDER BY c.orden, p.orden;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------
-- sp_registrar_calificacion EXTENDIDO (defaults al final:
-- las llamadas legacy de 6 args siguen funcionando).
-- Valida matricula + asignacion docente con mensajes claros,
-- guarda el contexto (parcial/ciclo) y hace upsert.
-- ---------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_registrar_calificacion(
    p_estudiante       INTEGER,
    p_materia          INTEGER,
    p_periodo          INTEGER,
    p_tipo_evaluacion  INTEGER,
    p_valor            NUMERIC(4,2),
    p_usuario          INTEGER,
    p_parcial          INTEGER DEFAULT NULL,
    p_ciclo            INTEGER DEFAULT NULL
) AS $$
DECLARE
    v_mat   INTEGER;
    v_rol   TEXT;
    v_prof  INTEGER;
    v_curso INTEGER;
    v_ok    INTEGER;
    v_ciclo INTEGER := p_ciclo;
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

    -- Deducir ciclo desde el parcial si no vino
    IF v_ciclo IS NULL AND p_parcial IS NOT NULL THEN
        SELECT id_ciclo INTO v_ciclo FROM parciales WHERE id_parcial = p_parcial;
    END IF;

    INSERT INTO calificaciones (
        id_estudiante, id_materia, id_periodo,
        id_tipo_evaluacion, valor, registrado_por, id_parcial, id_ciclo
    )
    VALUES (
        p_estudiante, p_materia, p_periodo,
        p_tipo_evaluacion, p_valor, p_usuario, p_parcial, v_ciclo
    )
    ON CONFLICT (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion)
    DO UPDATE SET
        valor           = EXCLUDED.valor,
        registrado_por  = EXCLUDED.registrado_por,
        fecha_registro  = NOW(),
        id_parcial      = COALESCE(EXCLUDED.id_parcial, calificaciones.id_parcial),
        id_ciclo        = COALESCE(EXCLUDED.id_ciclo, calificaciones.id_ciclo);

    -- Asegurar detalle de matricula por materia
    INSERT INTO matricula_materias (id_matricula, id_materia, estado)
    VALUES (v_mat, p_materia, 'cursando')
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------
-- REPORTE por curso/materia con CURSOR explicito
-- (requisito de la materia Taller de Funciones).
-- p_curso / p_materia opcionales: NULL = todos.
-- Devuelve promedio de LA materia (si se pide), promedio
-- general y escala cualitativa.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION sp_reporte_promedios_curso_materia(
    p_periodo  INTEGER,
    p_curso    INTEGER DEFAULT NULL,
    p_materia  INTEGER DEFAULT NULL
) RETURNS TABLE (
    id_estudiante    INTEGER,
    nombres          VARCHAR,
    apellidos        VARCHAR,
    curso            TEXT,
    promedio_materia NUMERIC(4,2),
    promedio_general NUMERIC(4,2),
    escala           TEXT
) AS $$
DECLARE
    cur_estudiantes CURSOR FOR
        SELECT e.id_estudiante, e.nombres, e.apellidos,
               (cu.nombre || ' ' || cu.paralelo)::TEXT AS nom_curso
        FROM matriculas m
        JOIN estudiantes e ON e.id_estudiante = m.id_estudiante
        LEFT JOIN cursos cu ON cu.id_curso = m.id_curso
        WHERE m.id_periodo = p_periodo
          AND (p_curso IS NULL OR m.id_curso = p_curso)
        ORDER BY e.apellidos, e.nombres;

    v_estudiante RECORD;
    v_prom_mat   NUMERIC(4,2);
    v_prom_gen   NUMERIC(4,2);
    v_contador   INTEGER := 0;
BEGIN
    OPEN cur_estudiantes;

    LOOP
        FETCH cur_estudiantes INTO v_estudiante;
        EXIT WHEN NOT FOUND;

        v_contador := v_contador + 1;
        v_prom_mat := NULL;
        v_prom_gen := NULL;

        IF p_materia IS NOT NULL THEN
            BEGIN
                v_prom_mat := fn_promedio_materia(v_estudiante.id_estudiante, p_materia, p_periodo);
            EXCEPTION WHEN OTHERS THEN
                v_prom_mat := NULL;
            END;
        END IF;

        BEGIN
            v_prom_gen := fn_promedio_general(v_estudiante.id_estudiante, p_periodo);
        EXCEPTION WHEN OTHERS THEN
            v_prom_gen := NULL;
        END;

        id_estudiante    := v_estudiante.id_estudiante;
        nombres          := v_estudiante.nombres;
        apellidos        := v_estudiante.apellidos;
        curso            := v_estudiante.nom_curso;
        promedio_materia := v_prom_mat;
        promedio_general := v_prom_gen;
        escala           := fn_escala_cualitativa(COALESCE(v_prom_mat, v_prom_gen));
        RETURN NEXT;
    END LOOP;

    CLOSE cur_estudiantes;

    IF v_contador = 0 THEN
        RAISE EXCEPTION 'No hay estudiantes matriculados en el periodo % para los filtros indicados', p_periodo;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------
-- Permisos para los objetos nuevos (la app conecta como
-- app_uteq/rol_admin; los GRANT de la migracion 04 no cubren
-- tablas creadas despues).
-- ---------------------------------------------------------
GRANT USAGE ON SCHEMA colegio TO rol_lectura, rol_profesor, rol_admin;
GRANT SELECT ON cursos, ciclos_evaluativos, parciales, matricula_materias TO rol_lectura;
GRANT SELECT ON cursos, ciclos_evaluativos, parciales TO rol_profesor;
GRANT INSERT, UPDATE ON calificaciones, matricula_materias TO rol_profesor;
GRANT ALL PRIVILEGES ON cursos, ciclos_evaluativos, parciales, matricula_materias TO rol_admin;
GRANT ALL PRIVILEGES ON SEQUENCE cursos_id_curso_seq, ciclos_evaluativos_id_ciclo_seq, parciales_id_parcial_seq, matricula_materias_id_detalle_seq TO rol_admin, rol_profesor;
REVOKE UPDATE, DELETE ON matricula_materias FROM rol_profesor;
ALTER DEFAULT PRIVILEGES IN SCHEMA colegio GRANT SELECT ON TABLES TO rol_lectura;

-- Refrescar promedios del detalle tras el cambio de formula
-- (recalcula matricula_materias con la funcion nueva).
DO $$
DECLARE
    r_det RECORD;
    v_prom NUMERIC(4,2);
BEGIN
    FOR r_det IN
        SELECT d.id_detalle, m.id_estudiante, d.id_materia, m.id_periodo
        FROM matricula_materias d
        JOIN matriculas m ON m.id_matricula = d.id_matricula
    LOOP
        BEGIN
            v_prom := fn_promedio_materia(r_det.id_estudiante, r_det.id_materia, r_det.id_periodo);
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
        WHERE id_detalle = r_det.id_detalle;
    END LOOP;
END
$$;
