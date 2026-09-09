-- =========================================================
-- 07_periodo_activo_cursos_ciclos.sql
-- FASE 1: periodo unico activo + cursos/paralelos +
--         ciclos evaluativos configurables (quimestre/
--         trimestre/bimestre) con parciales variables.
--
-- Diseno escalable segun normativa Ecuador (LOEI):
--   Anio lectivo (periodos_academicos)
--     -> Ciclos (quimestres/trimestres/bimestres, RENOMBRABLES,
--        N variable por periodo, con peso para el anual)
--       -> Parciales (N variable por ciclo, RENOMBRABLES)
--   Cursos/paralelos (8vo A, 8vo B...) por periodo.
-- =========================================================

SET search_path TO colegio;

-- ---------------------------------------------------------
-- 1. PERIODO UNICO ACTIVO
-- Solo puede existir UN periodo con activo = TRUE.
-- Todo el sistema opera sobre ese periodo ("periodo fijo").
-- Al activar uno nuevo, los promedios/materias del anterior
-- quedan congelados porque todo filtra por periodo.
-- ---------------------------------------------------------

-- Indice parcial: la base misma impide dos activos.
CREATE UNIQUE INDEX IF NOT EXISTS uq_periodo_unico_activo
    ON periodos_academicos ((activo))
    WHERE activo = TRUE;

-- Funcion + trigger: al activar un periodo, desactiva los demas.
CREATE OR REPLACE FUNCTION fn_solo_un_periodo_activo()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.activo = TRUE THEN
        UPDATE periodos_academicos
        SET activo = FALSE
        WHERE id_periodo <> NEW.id_periodo
          AND activo = TRUE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_solo_un_periodo_activo ON periodos_academicos;
CREATE TRIGGER trg_solo_un_periodo_activo
AFTER INSERT OR UPDATE OF activo ON periodos_academicos
FOR EACH ROW
WHEN (NEW.activo = TRUE)
EXECUTE FUNCTION fn_solo_un_periodo_activo();

-- Helper: devuelve el id del periodo activo (el "periodo fijo").
CREATE OR REPLACE FUNCTION fn_periodo_activo()
RETURNS INTEGER AS $$
DECLARE
    v_id INTEGER;
BEGIN
    SELECT id_periodo INTO v_id
    FROM periodos_academicos
    WHERE activo = TRUE
    ORDER BY fecha_inicio DESC
    LIMIT 1;

    IF v_id IS NULL THEN
        RAISE EXCEPTION 'No hay ningun periodo academico activo. Active uno desde /periodos.';
    END IF;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------
-- 2. CURSOS / PARALELOS (8vo A, 8vo B, 1ro BGU C...)
-- Un curso pertenece a UN periodo: al cambiar de periodo
-- cambian los cursos y sus promedios (empiezan de cero).
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS cursos (
    id_curso     SERIAL PRIMARY KEY,
    nombre       VARCHAR(80) NOT NULL,          -- ej. 'Octavo EGB', '1ro BGU'
    paralelo     VARCHAR(10) NOT NULL DEFAULT 'A', -- 'A', 'B', 'C'...
    id_periodo   INTEGER NOT NULL REFERENCES periodos_academicos(id_periodo) ON DELETE CASCADE,
    id_tutor     INTEGER REFERENCES profesores(id_profesor) ON DELETE SET NULL,
    UNIQUE (nombre, paralelo, id_periodo)
);

-- ---------------------------------------------------------
-- 3. CICLOS EVALUATIVOS CONFIGURABLES
-- nombre RENOMBRABLE a futuro ("Quimestre 1", "Trimestre 1",
-- "Bimestre 1"...). tipo cataloga el esquema usado ese anio.
-- peso: ponderacion del ciclo en el promedio anual
-- (ej. 2 quimestres -> 0.50 cada uno).
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS ciclos_evaluativos (
    id_ciclo     SERIAL PRIMARY KEY,
    id_periodo   INTEGER NOT NULL REFERENCES periodos_academicos(id_periodo) ON DELETE CASCADE,
    nombre       VARCHAR(60) NOT NULL,          -- renombrable: 'Quimestre 1', 'Trimestre 2'...
    tipo         VARCHAR(20) NOT NULL DEFAULT 'quimestre'
                 CHECK (tipo IN ('quimestre','trimestre','bimestre','semestre','otro')),
    orden        INTEGER NOT NULL CHECK (orden > 0),
    peso         NUMERIC(3,2) NOT NULL DEFAULT 0.50 CHECK (peso > 0 AND peso <= 1),
    UNIQUE (id_periodo, orden),
    UNIQUE (id_periodo, nombre)
);

-- ---------------------------------------------------------
-- 4. PARCIALES POR CICLO (N variable)
-- Un quimestre puede tener 2 o 3 parciales segun el colegio;
-- un trimestre/bimestre los que defina. Todo renombrable.
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS parciales (
    id_parcial   SERIAL PRIMARY KEY,
    id_ciclo     INTEGER NOT NULL REFERENCES ciclos_evaluativos(id_ciclo) ON DELETE CASCADE,
    nombre       VARCHAR(60) NOT NULL,          -- renombrable: 'Parcial 1'...
    orden        INTEGER NOT NULL CHECK (orden > 0),
    UNIQUE (id_ciclo, orden),
    UNIQUE (id_ciclo, nombre)
);

-- ---------------------------------------------------------
-- 5. MATRICULA -> CURSO (un estudiante cursa UN curso
--    por periodo; al cambiar de periodo se matricula de nuevo)
-- ---------------------------------------------------------
ALTER TABLE matriculas
    ADD COLUMN IF NOT EXISTS id_curso INTEGER REFERENCES cursos(id_curso) ON DELETE SET NULL;

-- ---------------------------------------------------------
-- 6. ASIGNACION PROFESOR -> CURSO
-- Una materia en un curso/periodo la dicta UN solo profesor
-- (se refuerza en la migracion 08 con indice unico).
-- ---------------------------------------------------------
ALTER TABLE profesor_materia_periodo
    ADD COLUMN IF NOT EXISTS id_curso INTEGER REFERENCES cursos(id_curso) ON DELETE CASCADE;

-- ---------------------------------------------------------
-- 7. CALIFICACION -> PARCIAL (contexto de la nota)
-- NULL = nota legacy (antes de esta migracion) o examen
-- transversal del ciclo. Los nuevos registros lo informan.
-- ---------------------------------------------------------
ALTER TABLE calificaciones
    ADD COLUMN IF NOT EXISTS id_parcial INTEGER REFERENCES parciales(id_parcial) ON DELETE SET NULL;

-- ---------------------------------------------------------
-- 8. BACKFILL: dotar al periodo(s) existente(s) de la
--    estructura por defecto Ecuador: 2 quimestres x 3
--    parciales + curso "Octavo EGB - A".
--    Idempotente: solo crea lo que falte.
-- ---------------------------------------------------------
DO $$
DECLARE
    r_per   RECORD;
    v_curso INTEGER;
    v_c1    INTEGER;
    v_c2    INTEGER;
    i       INTEGER;
BEGIN
    FOR r_per IN SELECT id_periodo FROM periodos_academicos LOOP
        -- Curso por defecto del periodo
        SELECT id_curso INTO v_curso
        FROM cursos
        WHERE nombre = 'Octavo EGB' AND paralelo = 'A' AND id_periodo = r_per.id_periodo;

        IF v_curso IS NULL THEN
            INSERT INTO cursos (nombre, paralelo, id_periodo)
            VALUES ('Octavo EGB', 'A', r_per.id_periodo)
            RETURNING id_curso INTO v_curso;
        END IF;

        -- Matriculas existentes -> curso por defecto
        UPDATE matriculas SET id_curso = v_curso
        WHERE id_periodo = r_per.id_periodo AND id_curso IS NULL;

        -- Asignaciones existentes -> curso por defecto
        UPDATE profesor_materia_periodo SET id_curso = v_curso
        WHERE id_periodo = r_per.id_periodo AND id_curso IS NULL;

        -- Ciclos por defecto (2 quimestres 50/50)
        SELECT id_ciclo INTO v_c1 FROM ciclos_evaluativos
        WHERE id_periodo = r_per.id_periodo AND orden = 1;
        IF v_c1 IS NULL THEN
            INSERT INTO ciclos_evaluativos (id_periodo, nombre, tipo, orden, peso)
            VALUES (r_per.id_periodo, 'Quimestre 1', 'quimestre', 1, 0.50)
            RETURNING id_ciclo INTO v_c1;
        END IF;

        SELECT id_ciclo INTO v_c2 FROM ciclos_evaluativos
        WHERE id_periodo = r_per.id_periodo AND orden = 2;
        IF v_c2 IS NULL THEN
            INSERT INTO ciclos_evaluativos (id_periodo, nombre, tipo, orden, peso)
            VALUES (r_per.id_periodo, 'Quimestre 2', 'quimestre', 2, 0.50)
            RETURNING id_ciclo INTO v_c2;
        END IF;

        -- 3 parciales por quimestre (estandar Ecuador)
        FOR i IN 1..3 LOOP
            INSERT INTO parciales (id_ciclo, nombre, orden)
            VALUES (v_c1, 'Parcial ' || i, i)
            ON CONFLICT DO NOTHING;
            INSERT INTO parciales (id_ciclo, nombre, orden)
            VALUES (v_c2, 'Parcial ' || i, i)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END LOOP;
END
$$;

-- ---------------------------------------------------------
-- 9. GARANTIA: si hay varios periodos activos legacy,
--    dejar activo solo el mas reciente.
-- ---------------------------------------------------------
DO $$
DECLARE
    v_keeper INTEGER;
BEGIN
    SELECT id_periodo INTO v_keeper
    FROM periodos_academicos
    WHERE activo = TRUE
    ORDER BY fecha_inicio DESC
    LIMIT 1;

    IF v_keeper IS NOT NULL THEN
        UPDATE periodos_academicos
        SET activo = FALSE
        WHERE activo = TRUE AND id_periodo <> v_keeper;
    END IF;
END
$$;
