-- =========================================================
-- RUN THIS AS postgres (or a superuser)
-- psql -U postgres -d sistema_calificaciones -f fix_tables.sql
-- =========================================================

-- Grant CREATE on schema to app_uteq
GRANT CREATE ON SCHEMA colegio TO app_uteq;
GRANT USAGE ON SCHEMA colegio TO app_uteq;

-- Create cursos table
CREATE TABLE IF NOT EXISTS colegio.cursos (
    id_curso     SERIAL PRIMARY KEY,
    nombre       VARCHAR(80) NOT NULL,
    paralelo     VARCHAR(10) NOT NULL DEFAULT 'A',
    id_periodo   INTEGER NOT NULL REFERENCES colegio.periodos_academicos(id_periodo) ON DELETE CASCADE,
    id_tutor     INTEGER REFERENCES colegio.profesores(id_profesor) ON DELETE SET NULL,
    UNIQUE (nombre, paralelo, id_periodo)
);

-- Create ciclos_evaluativos table
CREATE TABLE IF NOT EXISTS colegio.ciclos_evaluativos (
    id_ciclo     SERIAL PRIMARY KEY,
    id_periodo   INTEGER NOT NULL REFERENCES colegio.periodos_academicos(id_periodo) ON DELETE CASCADE,
    nombre       VARCHAR(60) NOT NULL,
    tipo         VARCHAR(20) NOT NULL DEFAULT 'quimestre'
                 CHECK (tipo IN ('quimestre','trimestre','bimestre','semestre','otro')),
    orden        INTEGER NOT NULL CHECK (orden > 0),
    peso         NUMERIC(3,2) NOT NULL DEFAULT 0.50 CHECK (peso > 0 AND peso <= 1),
    UNIQUE (id_periodo, orden),
    UNIQUE (id_periodo, nombre)
);

-- Create parciales table
CREATE TABLE IF NOT EXISTS colegio.parciales (
    id_parcial   SERIAL PRIMARY KEY,
    id_ciclo     INTEGER NOT NULL REFERENCES colegio.ciclos_evaluativos(id_ciclo) ON DELETE CASCADE,
    nombre       VARCHAR(60) NOT NULL,
    orden        INTEGER NOT NULL CHECK (orden > 0),
    UNIQUE (id_ciclo, orden),
    UNIQUE (id_ciclo, nombre)
);

-- Add id_curso to matriculas if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='colegio' AND table_name='matriculas' AND column_name='id_curso'
    ) THEN
        ALTER TABLE colegio.matriculas ADD COLUMN id_curso INTEGER REFERENCES colegio.cursos(id_curso) ON DELETE SET NULL;
    END IF;
END
$$;

-- Add id_curso to profesor_materia_periodo if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='colegio' AND table_name='profesor_materia_periodo' AND column_name='id_curso'
    ) THEN
        ALTER TABLE colegio.profesor_materia_periodo ADD COLUMN id_curso INTEGER REFERENCES colegio.cursos(id_curso) ON DELETE CASCADE;
    END IF;
END
$$;

-- Add id_parcial to calificaciones if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='colegio' AND table_name='calificaciones' AND column_name='id_parcial'
    ) THEN
        ALTER TABLE colegio.calificaciones ADD COLUMN id_parcial INTEGER REFERENCES colegio.parciales(id_parcial) ON DELETE SET NULL;
    END IF;
END
$$;

-- Backfill: create default curso for each period
DO $$
DECLARE
    r_per   RECORD;
    v_curso INTEGER;
    v_c1    INTEGER;
    v_c2    INTEGER;
    i       INTEGER;
BEGIN
    FOR r_per IN SELECT id_periodo FROM colegio.periodos_academicos LOOP
        SELECT id_curso INTO v_curso
        FROM colegio.cursos
        WHERE nombre = 'Octavo EGB' AND paralelo = 'A' AND id_periodo = r_per.id_periodo;

        IF v_curso IS NULL THEN
            INSERT INTO colegio.cursos (nombre, paralelo, id_periodo)
            VALUES ('Octavo EGB', 'A', r_per.id_periodo)
            RETURNING id_curso INTO v_curso;
        END IF;

        UPDATE colegio.matriculas SET id_curso = v_curso
        WHERE id_periodo = r_per.id_periodo AND id_curso IS NULL;

        UPDATE colegio.profesor_materia_periodo SET id_curso = v_curso
        WHERE id_periodo = r_per.id_periodo AND id_curso IS NULL;

        SELECT id_ciclo INTO v_c1 FROM colegio.ciclos_evaluativos
        WHERE id_periodo = r_per.id_periodo AND orden = 1;
        IF v_c1 IS NULL THEN
            INSERT INTO colegio.ciclos_evaluativos (id_periodo, nombre, tipo, orden, peso)
            VALUES (r_per.id_periodo, 'Quimestre 1', 'quimestre', 1, 0.50)
            RETURNING id_ciclo INTO v_c1;
        END IF;

        SELECT id_ciclo INTO v_c2 FROM colegio.ciclos_evaluativos
        WHERE id_periodo = r_per.id_periodo AND orden = 2;
        IF v_c2 IS NULL THEN
            INSERT INTO colegio.ciclos_evaluativos (id_periodo, nombre, tipo, orden, peso)
            VALUES (r_per.id_periodo, 'Quimestre 2', 'quimestre', 2, 0.50)
            RETURNING id_ciclo INTO v_c2;
        END IF;

        FOR i IN 1..3 LOOP
            INSERT INTO colegio.parciales (id_ciclo, nombre, orden)
            VALUES (v_c1, 'Parcial ' || i, i) ON CONFLICT DO NOTHING;
            INSERT INTO colegio.parciales (id_ciclo, nombre, orden)
            VALUES (v_c2, 'Parcial ' || i, i) ON CONFLICT DO NOTHING;
        END LOOP;
    END LOOP;
END
$$;

-- Grant all on new tables to app_uteq
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA colegio TO app_uteq;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA colegio TO app_uteq;

-- Create fn_escala_cualitativa if not exists
CREATE OR REPLACE FUNCTION colegio.fn_escala_cualitativa(p_nota NUMERIC)
RETURNS TEXT AS $$
BEGIN
    IF p_nota IS NULL THEN RETURN 'S/N'; END IF;
    IF p_nota >= 9.0 THEN RETURN 'AD'; END IF;
    IF p_nota >= 7.0 THEN RETURN 'A'; END IF;
    IF p_nota >= 5.0 THEN RETURN 'B'; END IF;
    IF p_nota >= 3.0 THEN RETURN 'C'; END IF;
    RETURN 'D';
END;
$$ LANGUAGE plpgsql;

-- Fix search_path on existing functions (add search_path)
ALTER FUNCTION colegio.fn_promedio_materia(INTEGER, INTEGER, INTEGER) SET search_path = colegio, public;
ALTER FUNCTION colegio.fn_promedio_general(INTEGER, INTEGER) SET search_path = colegio, public;
ALTER FUNCTION colegio.sp_registrar_calificacion(INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, INTEGER) SET search_path = colegio, public;
ALTER FUNCTION colegio.sp_reporte_promedios_periodo(INTEGER) SET search_path = colegio, public;
ALTER FUNCTION colegio.fn_escala_cualitativa(NUMERIC) SET search_path = colegio, public;
