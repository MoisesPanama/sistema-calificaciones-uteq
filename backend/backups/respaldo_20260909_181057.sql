--
-- PostgreSQL database dump
--

\restrict iFjYO32c6IkmvUznahue6y7poonZaOVAZutB192ngYWHVrx0z2cnyYbS9YZmcL2

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: colegio; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA colegio;


--
-- Name: fn_auditoria_generica(); Type: FUNCTION; Schema: colegio; Owner: -
--

CREATE FUNCTION colegio.fn_auditoria_generica() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_usuario_app  INTEGER;
    v_id_registro  INTEGER;
BEGIN
    -- Intenta leer el usuario de aplicacion seteado desde Node.
    -- Si no fue seteado, queda NULL (ej. procesos internos).
    BEGIN
        v_usuario_app := current_setting('app.current_user_id')::INTEGER;
    EXCEPTION WHEN OTHERS THEN
        v_usuario_app := NULL;
    END;

    IF TG_OP = 'DELETE' THEN
        v_id_registro := (row_to_json(OLD)->>(TG_ARGV[0]))::INTEGER;

        INSERT INTO auditoria (
            tabla_afectada, operacion, id_registro,
            usuario_bd, id_usuario_app, datos_anteriores, datos_nuevos
        ) VALUES (
            TG_TABLE_NAME, TG_OP, v_id_registro,
            current_user, v_usuario_app, row_to_json(OLD)::JSONB, NULL
        );
        RETURN OLD;

    ELSIF TG_OP = 'UPDATE' THEN
        v_id_registro := (row_to_json(NEW)->>(TG_ARGV[0]))::INTEGER;

        INSERT INTO auditoria (
            tabla_afectada, operacion, id_registro,
            usuario_bd, id_usuario_app, datos_anteriores, datos_nuevos
        ) VALUES (
            TG_TABLE_NAME, TG_OP, v_id_registro,
            current_user, v_usuario_app, row_to_json(OLD)::JSONB, row_to_json(NEW)::JSONB
        );
        RETURN NEW;

    ELSIF TG_OP = 'INSERT' THEN
        v_id_registro := (row_to_json(NEW)->>(TG_ARGV[0]))::INTEGER;

        INSERT INTO auditoria (
            tabla_afectada, operacion, id_registro,
            usuario_bd, id_usuario_app, datos_anteriores, datos_nuevos
        ) VALUES (
            TG_TABLE_NAME, TG_OP, v_id_registro,
            current_user, v_usuario_app, NULL, row_to_json(NEW)::JSONB
        );
        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$;


--
-- Name: fn_promedio_general(integer, integer); Type: FUNCTION; Schema: colegio; Owner: -
--

CREATE FUNCTION colegio.fn_promedio_general(p_estudiante integer, p_periodo integer) RETURNS numeric
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: fn_promedio_materia(integer, integer, integer); Type: FUNCTION; Schema: colegio; Owner: -
--

CREATE FUNCTION colegio.fn_promedio_materia(p_estudiante integer, p_materia integer, p_periodo integer) RETURNS numeric
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: fn_validar_calificacion(); Type: FUNCTION; Schema: colegio; Owner: -
--

CREATE FUNCTION colegio.fn_validar_calificacion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.valor IS NULL THEN
        RAISE EXCEPTION 'La calificacion no puede ser nula';
    END IF;

    IF NEW.valor < 0 OR NEW.valor > 10 THEN
        RAISE EXCEPTION 'La calificacion % esta fuera de rango (0 a 10)', NEW.valor;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: sp_registrar_calificacion(integer, integer, integer, integer, numeric, integer); Type: PROCEDURE; Schema: colegio; Owner: -
--

CREATE PROCEDURE colegio.sp_registrar_calificacion(IN p_estudiante integer, IN p_materia integer, IN p_periodo integer, IN p_tipo_evaluacion integer, IN p_valor numeric, IN p_usuario integer)
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: sp_reporte_promedios_periodo(integer); Type: FUNCTION; Schema: colegio; Owner: -
--

CREATE FUNCTION colegio.sp_reporte_promedios_periodo(p_periodo integer) RETURNS TABLE(id_estudiante integer, nombres character varying, apellidos character varying, promedio numeric)
    LANGUAGE plpgsql
    AS $$
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
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: auditoria; Type: TABLE; Schema: colegio; Owner: -
--

CREATE TABLE colegio.auditoria (
    id_auditoria integer NOT NULL,
    tabla_afectada character varying(50) NOT NULL,
    operacion character varying(10) NOT NULL,
    id_registro integer,
    usuario_bd character varying(60) NOT NULL,
    id_usuario_app integer,
    datos_anteriores jsonb,
    datos_nuevos jsonb,
    fecha_evento timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT auditoria_operacion_check CHECK (((operacion)::text = ANY ((ARRAY['INSERT'::character varying, 'UPDATE'::character varying, 'DELETE'::character varying])::text[])))
);


--
-- Name: auditoria_id_auditoria_seq; Type: SEQUENCE; Schema: colegio; Owner: -
--

CREATE SEQUENCE colegio.auditoria_id_auditoria_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auditoria_id_auditoria_seq; Type: SEQUENCE OWNED BY; Schema: colegio; Owner: -
--

ALTER SEQUENCE colegio.auditoria_id_auditoria_seq OWNED BY colegio.auditoria.id_auditoria;


--
-- Name: calificaciones; Type: TABLE; Schema: colegio; Owner: -
--

CREATE TABLE colegio.calificaciones (
    id_calificacion integer NOT NULL,
    id_estudiante integer NOT NULL,
    id_materia integer NOT NULL,
    id_periodo integer NOT NULL,
    id_tipo_evaluacion integer NOT NULL,
    valor numeric(4,2) NOT NULL,
    registrado_por integer NOT NULL,
    fecha_registro timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT calificaciones_valor_check CHECK (((valor >= (0)::numeric) AND (valor <= (10)::numeric)))
);


--
-- Name: calificaciones_id_calificacion_seq; Type: SEQUENCE; Schema: colegio; Owner: -
--

CREATE SEQUENCE colegio.calificaciones_id_calificacion_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: calificaciones_id_calificacion_seq; Type: SEQUENCE OWNED BY; Schema: colegio; Owner: -
--

ALTER SEQUENCE colegio.calificaciones_id_calificacion_seq OWNED BY colegio.calificaciones.id_calificacion;


--
-- Name: estudiantes; Type: TABLE; Schema: colegio; Owner: -
--

CREATE TABLE colegio.estudiantes (
    id_estudiante integer NOT NULL,
    cedula character varying(15) NOT NULL,
    nombres character varying(80) NOT NULL,
    apellidos character varying(80) NOT NULL,
    fecha_nacimiento date NOT NULL,
    id_representante integer NOT NULL,
    id_usuario integer,
    activo boolean DEFAULT true NOT NULL
);


--
-- Name: estudiantes_id_estudiante_seq; Type: SEQUENCE; Schema: colegio; Owner: -
--

CREATE SEQUENCE colegio.estudiantes_id_estudiante_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: estudiantes_id_estudiante_seq; Type: SEQUENCE OWNED BY; Schema: colegio; Owner: -
--

ALTER SEQUENCE colegio.estudiantes_id_estudiante_seq OWNED BY colegio.estudiantes.id_estudiante;


--
-- Name: materias; Type: TABLE; Schema: colegio; Owner: -
--

CREATE TABLE colegio.materias (
    id_materia integer NOT NULL,
    nombre character varying(80) NOT NULL,
    descripcion text
);


--
-- Name: materias_id_materia_seq; Type: SEQUENCE; Schema: colegio; Owner: -
--

CREATE SEQUENCE colegio.materias_id_materia_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: materias_id_materia_seq; Type: SEQUENCE OWNED BY; Schema: colegio; Owner: -
--

ALTER SEQUENCE colegio.materias_id_materia_seq OWNED BY colegio.materias.id_materia;


--
-- Name: matriculas; Type: TABLE; Schema: colegio; Owner: -
--

CREATE TABLE colegio.matriculas (
    id_matricula integer NOT NULL,
    id_estudiante integer NOT NULL,
    id_periodo integer NOT NULL
);


--
-- Name: matriculas_id_matricula_seq; Type: SEQUENCE; Schema: colegio; Owner: -
--

CREATE SEQUENCE colegio.matriculas_id_matricula_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: matriculas_id_matricula_seq; Type: SEQUENCE OWNED BY; Schema: colegio; Owner: -
--

ALTER SEQUENCE colegio.matriculas_id_matricula_seq OWNED BY colegio.matriculas.id_matricula;


--
-- Name: periodos_academicos; Type: TABLE; Schema: colegio; Owner: -
--

CREATE TABLE colegio.periodos_academicos (
    id_periodo integer NOT NULL,
    nombre character varying(60) NOT NULL,
    fecha_inicio date NOT NULL,
    fecha_fin date NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    CONSTRAINT chk_fechas_periodo CHECK ((fecha_fin > fecha_inicio))
);


--
-- Name: periodos_academicos_id_periodo_seq; Type: SEQUENCE; Schema: colegio; Owner: -
--

CREATE SEQUENCE colegio.periodos_academicos_id_periodo_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: periodos_academicos_id_periodo_seq; Type: SEQUENCE OWNED BY; Schema: colegio; Owner: -
--

ALTER SEQUENCE colegio.periodos_academicos_id_periodo_seq OWNED BY colegio.periodos_academicos.id_periodo;


--
-- Name: profesor_materia_periodo; Type: TABLE; Schema: colegio; Owner: -
--

CREATE TABLE colegio.profesor_materia_periodo (
    id_asignacion integer NOT NULL,
    id_profesor integer NOT NULL,
    id_materia integer NOT NULL,
    id_periodo integer NOT NULL
);


--
-- Name: profesor_materia_periodo_id_asignacion_seq; Type: SEQUENCE; Schema: colegio; Owner: -
--

CREATE SEQUENCE colegio.profesor_materia_periodo_id_asignacion_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: profesor_materia_periodo_id_asignacion_seq; Type: SEQUENCE OWNED BY; Schema: colegio; Owner: -
--

ALTER SEQUENCE colegio.profesor_materia_periodo_id_asignacion_seq OWNED BY colegio.profesor_materia_periodo.id_asignacion;


--
-- Name: profesores; Type: TABLE; Schema: colegio; Owner: -
--

CREATE TABLE colegio.profesores (
    id_profesor integer NOT NULL,
    cedula character varying(15) NOT NULL,
    nombres character varying(80) NOT NULL,
    apellidos character varying(80) NOT NULL,
    especialidad character varying(80),
    id_usuario integer,
    activo boolean DEFAULT true NOT NULL
);


--
-- Name: profesores_id_profesor_seq; Type: SEQUENCE; Schema: colegio; Owner: -
--

CREATE SEQUENCE colegio.profesores_id_profesor_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: profesores_id_profesor_seq; Type: SEQUENCE OWNED BY; Schema: colegio; Owner: -
--

ALTER SEQUENCE colegio.profesores_id_profesor_seq OWNED BY colegio.profesores.id_profesor;


--
-- Name: representantes; Type: TABLE; Schema: colegio; Owner: -
--

CREATE TABLE colegio.representantes (
    id_representante integer NOT NULL,
    nombres character varying(80) NOT NULL,
    apellidos character varying(80) NOT NULL,
    telefono character varying(20),
    email character varying(120)
);


--
-- Name: representantes_id_representante_seq; Type: SEQUENCE; Schema: colegio; Owner: -
--

CREATE SEQUENCE colegio.representantes_id_representante_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: representantes_id_representante_seq; Type: SEQUENCE OWNED BY; Schema: colegio; Owner: -
--

ALTER SEQUENCE colegio.representantes_id_representante_seq OWNED BY colegio.representantes.id_representante;


--
-- Name: roles; Type: TABLE; Schema: colegio; Owner: -
--

CREATE TABLE colegio.roles (
    id_rol integer NOT NULL,
    nombre_rol character varying(30) NOT NULL
);


--
-- Name: roles_id_rol_seq; Type: SEQUENCE; Schema: colegio; Owner: -
--

CREATE SEQUENCE colegio.roles_id_rol_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles_id_rol_seq; Type: SEQUENCE OWNED BY; Schema: colegio; Owner: -
--

ALTER SEQUENCE colegio.roles_id_rol_seq OWNED BY colegio.roles.id_rol;


--
-- Name: sesiones; Type: TABLE; Schema: colegio; Owner: -
--

CREATE TABLE colegio.sesiones (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


--
-- Name: tipos_evaluacion; Type: TABLE; Schema: colegio; Owner: -
--

CREATE TABLE colegio.tipos_evaluacion (
    id_tipo_evaluacion integer NOT NULL,
    nombre character varying(50) NOT NULL,
    peso numeric(3,2) NOT NULL,
    CONSTRAINT tipos_evaluacion_peso_check CHECK (((peso > (0)::numeric) AND (peso <= (1)::numeric)))
);


--
-- Name: tipos_evaluacion_id_tipo_evaluacion_seq; Type: SEQUENCE; Schema: colegio; Owner: -
--

CREATE SEQUENCE colegio.tipos_evaluacion_id_tipo_evaluacion_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tipos_evaluacion_id_tipo_evaluacion_seq; Type: SEQUENCE OWNED BY; Schema: colegio; Owner: -
--

ALTER SEQUENCE colegio.tipos_evaluacion_id_tipo_evaluacion_seq OWNED BY colegio.tipos_evaluacion.id_tipo_evaluacion;


--
-- Name: usuarios; Type: TABLE; Schema: colegio; Owner: -
--

CREATE TABLE colegio.usuarios (
    id_usuario integer NOT NULL,
    nombres character varying(80) NOT NULL,
    apellidos character varying(80) NOT NULL,
    email character varying(120) NOT NULL,
    password_hash character varying(255) NOT NULL,
    id_rol integer NOT NULL,
    activo boolean DEFAULT true NOT NULL
);


--
-- Name: usuarios_id_usuario_seq; Type: SEQUENCE; Schema: colegio; Owner: -
--

CREATE SEQUENCE colegio.usuarios_id_usuario_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usuarios_id_usuario_seq; Type: SEQUENCE OWNED BY; Schema: colegio; Owner: -
--

ALTER SEQUENCE colegio.usuarios_id_usuario_seq OWNED BY colegio.usuarios.id_usuario;


--
-- Name: auditoria id_auditoria; Type: DEFAULT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.auditoria ALTER COLUMN id_auditoria SET DEFAULT nextval('colegio.auditoria_id_auditoria_seq'::regclass);


--
-- Name: calificaciones id_calificacion; Type: DEFAULT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.calificaciones ALTER COLUMN id_calificacion SET DEFAULT nextval('colegio.calificaciones_id_calificacion_seq'::regclass);


--
-- Name: estudiantes id_estudiante; Type: DEFAULT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.estudiantes ALTER COLUMN id_estudiante SET DEFAULT nextval('colegio.estudiantes_id_estudiante_seq'::regclass);


--
-- Name: materias id_materia; Type: DEFAULT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.materias ALTER COLUMN id_materia SET DEFAULT nextval('colegio.materias_id_materia_seq'::regclass);


--
-- Name: matriculas id_matricula; Type: DEFAULT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.matriculas ALTER COLUMN id_matricula SET DEFAULT nextval('colegio.matriculas_id_matricula_seq'::regclass);


--
-- Name: periodos_academicos id_periodo; Type: DEFAULT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.periodos_academicos ALTER COLUMN id_periodo SET DEFAULT nextval('colegio.periodos_academicos_id_periodo_seq'::regclass);


--
-- Name: profesor_materia_periodo id_asignacion; Type: DEFAULT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.profesor_materia_periodo ALTER COLUMN id_asignacion SET DEFAULT nextval('colegio.profesor_materia_periodo_id_asignacion_seq'::regclass);


--
-- Name: profesores id_profesor; Type: DEFAULT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.profesores ALTER COLUMN id_profesor SET DEFAULT nextval('colegio.profesores_id_profesor_seq'::regclass);


--
-- Name: representantes id_representante; Type: DEFAULT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.representantes ALTER COLUMN id_representante SET DEFAULT nextval('colegio.representantes_id_representante_seq'::regclass);


--
-- Name: roles id_rol; Type: DEFAULT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.roles ALTER COLUMN id_rol SET DEFAULT nextval('colegio.roles_id_rol_seq'::regclass);


--
-- Name: tipos_evaluacion id_tipo_evaluacion; Type: DEFAULT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.tipos_evaluacion ALTER COLUMN id_tipo_evaluacion SET DEFAULT nextval('colegio.tipos_evaluacion_id_tipo_evaluacion_seq'::regclass);


--
-- Name: usuarios id_usuario; Type: DEFAULT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.usuarios ALTER COLUMN id_usuario SET DEFAULT nextval('colegio.usuarios_id_usuario_seq'::regclass);


--
-- Data for Name: auditoria; Type: TABLE DATA; Schema: colegio; Owner: -
--

COPY colegio.auditoria (id_auditoria, tabla_afectada, operacion, id_registro, usuario_bd, id_usuario_app, datos_anteriores, datos_nuevos, fecha_evento) FROM stdin;
1	usuarios	INSERT	1	postgres	\N	\N	{"email": "admin@uteq.edu.ec", "activo": true, "id_rol": 1, "nombres": "Moises", "apellidos": "Panama", "id_usuario": 1, "password_hash": "PENDIENTE_HASH"}	2026-09-08 20:31:16.216768
2	usuarios	INSERT	2	postgres	\N	\N	{"email": "carla.vera@uteq.edu.ec", "activo": true, "id_rol": 2, "nombres": "Carla", "apellidos": "Vera", "id_usuario": 2, "password_hash": "PENDIENTE_HASH"}	2026-09-08 20:31:16.216768
3	usuarios	INSERT	3	postgres	\N	\N	{"email": "jorge.mendoza@uteq.edu.ec", "activo": true, "id_rol": 2, "nombres": "Jorge", "apellidos": "Mendoza", "id_usuario": 3, "password_hash": "PENDIENTE_HASH"}	2026-09-08 20:31:16.216768
4	matriculas	INSERT	1	postgres	\N	\N	{"id_periodo": 1, "id_matricula": 1, "id_estudiante": 1}	2026-09-08 20:31:16.244781
5	matriculas	INSERT	2	postgres	\N	\N	{"id_periodo": 1, "id_matricula": 2, "id_estudiante": 2}	2026-09-08 20:31:16.244781
6	matriculas	INSERT	3	postgres	\N	\N	{"id_periodo": 1, "id_matricula": 3, "id_estudiante": 3}	2026-09-08 20:31:16.244781
7	calificaciones	INSERT	1	postgres	\N	\N	{"valor": 8.50, "id_materia": 1, "id_periodo": 1, "id_estudiante": 1, "fecha_registro": "2026-09-08T20:31:16.253093", "registrado_por": 2, "id_calificacion": 1, "id_tipo_evaluacion": 1}	2026-09-08 20:31:16.253093
8	calificaciones	INSERT	2	postgres	\N	\N	{"valor": 9.00, "id_materia": 1, "id_periodo": 1, "id_estudiante": 1, "fecha_registro": "2026-09-08T20:31:16.258165", "registrado_por": 2, "id_calificacion": 2, "id_tipo_evaluacion": 2}	2026-09-08 20:31:16.258165
9	calificaciones	INSERT	3	postgres	\N	\N	{"valor": 7.75, "id_materia": 1, "id_periodo": 1, "id_estudiante": 1, "fecha_registro": "2026-09-08T20:31:16.259275", "registrado_por": 2, "id_calificacion": 3, "id_tipo_evaluacion": 3}	2026-09-08 20:31:16.259275
10	calificaciones	INSERT	4	postgres	\N	\N	{"valor": 6.00, "id_materia": 1, "id_periodo": 1, "id_estudiante": 2, "fecha_registro": "2026-09-08T20:31:16.260439", "registrado_por": 2, "id_calificacion": 4, "id_tipo_evaluacion": 1}	2026-09-08 20:31:16.260439
11	calificaciones	INSERT	5	postgres	\N	\N	{"valor": 7.20, "id_materia": 1, "id_periodo": 1, "id_estudiante": 2, "fecha_registro": "2026-09-08T20:31:16.262237", "registrado_por": 2, "id_calificacion": 5, "id_tipo_evaluacion": 2}	2026-09-08 20:31:16.262237
12	calificaciones	INSERT	6	postgres	\N	\N	{"valor": 9.50, "id_materia": 2, "id_periodo": 1, "id_estudiante": 1, "fecha_registro": "2026-09-08T20:31:16.2632", "registrado_por": 3, "id_calificacion": 6, "id_tipo_evaluacion": 1}	2026-09-08 20:31:16.2632
13	calificaciones	INSERT	7	postgres	\N	\N	{"valor": 8.00, "id_materia": 2, "id_periodo": 1, "id_estudiante": 3, "fecha_registro": "2026-09-08T20:31:16.264485", "registrado_por": 3, "id_calificacion": 7, "id_tipo_evaluacion": 1}	2026-09-08 20:31:16.264485
14	usuarios	UPDATE	1	postgres	\N	{"email": "admin@uteq.edu.ec", "activo": true, "id_rol": 1, "nombres": "Moises", "apellidos": "Panama", "id_usuario": 1, "password_hash": "PENDIENTE_HASH"}	{"email": "admin@uteq.edu.ec", "activo": true, "id_rol": 1, "nombres": "Moises", "apellidos": "Panama", "id_usuario": 1, "password_hash": ".G60I7Iu4ojhUpbEtLIuWwIm..40g8x6"}	2026-09-08 20:34:24.204091
15	usuarios	UPDATE	2	postgres	\N	{"email": "carla.vera@uteq.edu.ec", "activo": true, "id_rol": 2, "nombres": "Carla", "apellidos": "Vera", "id_usuario": 2, "password_hash": "PENDIENTE_HASH"}	{"email": "carla.vera@uteq.edu.ec", "activo": true, "id_rol": 2, "nombres": "Carla", "apellidos": "Vera", "id_usuario": 2, "password_hash": "/rqSu0bmnOctH8MMNiCsesh4J1HGTbbbAKpa"}	2026-09-08 20:34:28.109807
16	usuarios	UPDATE	3	postgres	\N	{"email": "jorge.mendoza@uteq.edu.ec", "activo": true, "id_rol": 2, "nombres": "Jorge", "apellidos": "Mendoza", "id_usuario": 3, "password_hash": "PENDIENTE_HASH"}	{"email": "jorge.mendoza@uteq.edu.ec", "activo": true, "id_rol": 2, "nombres": "Jorge", "apellidos": "Mendoza", "id_usuario": 3, "password_hash": "/rqSu0bmnOctH8MMNiCsesh4J1HGTbbbAKpa"}	2026-09-08 20:34:28.109807
17	usuarios	UPDATE	1	app_uteq	\N	{"email": "admin@uteq.edu.ec", "activo": true, "id_rol": 1, "nombres": "Moises", "apellidos": "Panama", "id_usuario": 1, "password_hash": ".G60I7Iu4ojhUpbEtLIuWwIm..40g8x6"}	{"email": "admin@uteq.edu.ec", "activo": true, "id_rol": 1, "nombres": "Moises", "apellidos": "Panama", "id_usuario": 1, "password_hash": "$2b$10$.9rk4MxOlDi6Jf5KhOrPCOKe77.D.Eytt3uThBTnSCWdsal8U24A."}	2026-09-08 20:38:33.496331
18	usuarios	UPDATE	2	app_uteq	\N	{"email": "carla.vera@uteq.edu.ec", "activo": true, "id_rol": 2, "nombres": "Carla", "apellidos": "Vera", "id_usuario": 2, "password_hash": "/rqSu0bmnOctH8MMNiCsesh4J1HGTbbbAKpa"}	{"email": "carla.vera@uteq.edu.ec", "activo": true, "id_rol": 2, "nombres": "Carla", "apellidos": "Vera", "id_usuario": 2, "password_hash": "$2b$10$5ZplphSVBSZonbr8i0ctR.BKbVakXpW0NfLt.PKzHppqTX.SSK6PG"}	2026-09-08 20:38:33.505503
19	usuarios	UPDATE	3	app_uteq	\N	{"email": "jorge.mendoza@uteq.edu.ec", "activo": true, "id_rol": 2, "nombres": "Jorge", "apellidos": "Mendoza", "id_usuario": 3, "password_hash": "/rqSu0bmnOctH8MMNiCsesh4J1HGTbbbAKpa"}	{"email": "jorge.mendoza@uteq.edu.ec", "activo": true, "id_rol": 2, "nombres": "Jorge", "apellidos": "Mendoza", "id_usuario": 3, "password_hash": "$2b$10$5ZplphSVBSZonbr8i0ctR.BKbVakXpW0NfLt.PKzHppqTX.SSK6PG"}	2026-09-08 20:38:33.505503
20	calificaciones	DELETE	1	postgres	\N	{"valor": 8.50, "id_materia": 1, "id_periodo": 1, "id_estudiante": 1, "fecha_registro": "2026-09-08T20:31:16.253093", "registrado_por": 2, "id_calificacion": 1, "id_tipo_evaluacion": 1}	\N	2026-09-08 20:55:33.696202
21	calificaciones	DELETE	2	postgres	\N	{"valor": 9.00, "id_materia": 1, "id_periodo": 1, "id_estudiante": 1, "fecha_registro": "2026-09-08T20:31:16.258165", "registrado_por": 2, "id_calificacion": 2, "id_tipo_evaluacion": 2}	\N	2026-09-08 20:55:33.696202
22	calificaciones	DELETE	3	postgres	\N	{"valor": 7.75, "id_materia": 1, "id_periodo": 1, "id_estudiante": 1, "fecha_registro": "2026-09-08T20:31:16.259275", "registrado_por": 2, "id_calificacion": 3, "id_tipo_evaluacion": 3}	\N	2026-09-08 20:55:33.696202
23	calificaciones	DELETE	4	postgres	\N	{"valor": 6.00, "id_materia": 1, "id_periodo": 1, "id_estudiante": 2, "fecha_registro": "2026-09-08T20:31:16.260439", "registrado_por": 2, "id_calificacion": 4, "id_tipo_evaluacion": 1}	\N	2026-09-08 20:55:33.696202
24	calificaciones	DELETE	5	postgres	\N	{"valor": 7.20, "id_materia": 1, "id_periodo": 1, "id_estudiante": 2, "fecha_registro": "2026-09-08T20:31:16.262237", "registrado_por": 2, "id_calificacion": 5, "id_tipo_evaluacion": 2}	\N	2026-09-08 20:55:33.696202
25	calificaciones	DELETE	6	postgres	\N	{"valor": 9.50, "id_materia": 2, "id_periodo": 1, "id_estudiante": 1, "fecha_registro": "2026-09-08T20:31:16.2632", "registrado_por": 3, "id_calificacion": 6, "id_tipo_evaluacion": 1}	\N	2026-09-08 20:55:33.696202
26	calificaciones	DELETE	7	postgres	\N	{"valor": 8.00, "id_materia": 2, "id_periodo": 1, "id_estudiante": 3, "fecha_registro": "2026-09-08T20:31:16.264485", "registrado_por": 3, "id_calificacion": 7, "id_tipo_evaluacion": 1}	\N	2026-09-08 20:55:33.696202
27	matriculas	DELETE	1	postgres	\N	{"id_periodo": 1, "id_matricula": 1, "id_estudiante": 1}	\N	2026-09-08 20:55:33.708133
28	matriculas	DELETE	2	postgres	\N	{"id_periodo": 1, "id_matricula": 2, "id_estudiante": 2}	\N	2026-09-08 20:55:33.708133
29	matriculas	DELETE	3	postgres	\N	{"id_periodo": 1, "id_matricula": 3, "id_estudiante": 3}	\N	2026-09-08 20:55:33.708133
30	matriculas	INSERT	10	app_uteq	\N	\N	{"id_periodo": 1, "id_matricula": 10, "id_estudiante": 1}	2026-09-08 20:55:54.858213
31	matriculas	INSERT	11	app_uteq	\N	\N	{"id_periodo": 1, "id_matricula": 11, "id_estudiante": 2}	2026-09-08 20:55:54.858213
32	matriculas	INSERT	12	app_uteq	\N	\N	{"id_periodo": 1, "id_matricula": 12, "id_estudiante": 3}	2026-09-08 20:55:54.858213
33	matriculas	INSERT	13	app_uteq	\N	\N	{"id_periodo": 2, "id_matricula": 13, "id_estudiante": 1}	2026-09-08 20:55:54.858213
34	matriculas	INSERT	14	app_uteq	\N	\N	{"id_periodo": 2, "id_matricula": 14, "id_estudiante": 2}	2026-09-08 20:55:54.858213
35	matriculas	INSERT	15	app_uteq	\N	\N	{"id_periodo": 2, "id_matricula": 15, "id_estudiante": 3}	2026-09-08 20:55:54.858213
36	calificaciones	INSERT	25	app_uteq	\N	\N	{"valor": 8.50, "id_materia": 1, "id_periodo": 1, "id_estudiante": 1, "fecha_registro": "2026-09-08T20:55:54.858213", "registrado_por": 2, "id_calificacion": 25, "id_tipo_evaluacion": 1}	2026-09-08 20:55:54.858213
37	calificaciones	INSERT	26	app_uteq	\N	\N	{"valor": 9.00, "id_materia": 1, "id_periodo": 1, "id_estudiante": 1, "fecha_registro": "2026-09-08T20:55:54.858213", "registrado_por": 2, "id_calificacion": 26, "id_tipo_evaluacion": 2}	2026-09-08 20:55:54.858213
38	calificaciones	INSERT	27	app_uteq	\N	\N	{"valor": 7.75, "id_materia": 1, "id_periodo": 1, "id_estudiante": 1, "fecha_registro": "2026-09-08T20:55:54.858213", "registrado_por": 2, "id_calificacion": 27, "id_tipo_evaluacion": 3}	2026-09-08 20:55:54.858213
39	calificaciones	INSERT	28	app_uteq	\N	\N	{"valor": 6.00, "id_materia": 1, "id_periodo": 1, "id_estudiante": 2, "fecha_registro": "2026-09-08T20:55:54.858213", "registrado_por": 2, "id_calificacion": 28, "id_tipo_evaluacion": 1}	2026-09-08 20:55:54.858213
40	calificaciones	INSERT	29	app_uteq	\N	\N	{"valor": 7.20, "id_materia": 1, "id_periodo": 1, "id_estudiante": 2, "fecha_registro": "2026-09-08T20:55:54.858213", "registrado_por": 2, "id_calificacion": 29, "id_tipo_evaluacion": 2}	2026-09-08 20:55:54.858213
41	calificaciones	INSERT	30	app_uteq	\N	\N	{"valor": 6.80, "id_materia": 1, "id_periodo": 1, "id_estudiante": 2, "fecha_registro": "2026-09-08T20:55:54.858213", "registrado_por": 2, "id_calificacion": 30, "id_tipo_evaluacion": 3}	2026-09-08 20:55:54.858213
42	calificaciones	INSERT	31	app_uteq	\N	\N	{"valor": 9.50, "id_materia": 2, "id_periodo": 1, "id_estudiante": 1, "fecha_registro": "2026-09-08T20:55:54.858213", "registrado_por": 3, "id_calificacion": 31, "id_tipo_evaluacion": 1}	2026-09-08 20:55:54.858213
43	calificaciones	INSERT	32	app_uteq	\N	\N	{"valor": 8.80, "id_materia": 2, "id_periodo": 1, "id_estudiante": 1, "fecha_registro": "2026-09-08T20:55:54.858213", "registrado_por": 3, "id_calificacion": 32, "id_tipo_evaluacion": 2}	2026-09-08 20:55:54.858213
44	calificaciones	INSERT	33	app_uteq	\N	\N	{"valor": 9.20, "id_materia": 2, "id_periodo": 1, "id_estudiante": 1, "fecha_registro": "2026-09-08T20:55:54.858213", "registrado_por": 3, "id_calificacion": 33, "id_tipo_evaluacion": 3}	2026-09-08 20:55:54.858213
45	calificaciones	INSERT	34	app_uteq	\N	\N	{"valor": 8.00, "id_materia": 2, "id_periodo": 1, "id_estudiante": 3, "fecha_registro": "2026-09-08T20:55:54.858213", "registrado_por": 3, "id_calificacion": 34, "id_tipo_evaluacion": 1}	2026-09-08 20:55:54.858213
46	calificaciones	INSERT	35	app_uteq	\N	\N	{"valor": 7.50, "id_materia": 2, "id_periodo": 1, "id_estudiante": 3, "fecha_registro": "2026-09-08T20:55:54.858213", "registrado_por": 3, "id_calificacion": 35, "id_tipo_evaluacion": 2}	2026-09-08 20:55:54.858213
47	calificaciones	INSERT	36	app_uteq	\N	\N	{"valor": 7.00, "id_materia": 2, "id_periodo": 1, "id_estudiante": 2, "fecha_registro": "2026-09-08T20:55:54.858213", "registrado_por": 3, "id_calificacion": 36, "id_tipo_evaluacion": 1}	2026-09-08 20:55:54.858213
48	calificaciones	INSERT	37	app_uteq	\N	\N	{"valor": 7.50, "id_materia": 2, "id_periodo": 1, "id_estudiante": 2, "fecha_registro": "2026-09-08T20:55:54.858213", "registrado_por": 3, "id_calificacion": 37, "id_tipo_evaluacion": 2}	2026-09-08 20:55:54.858213
49	calificaciones	INSERT	38	app_uteq	\N	\N	{"valor": 8.00, "id_materia": 2, "id_periodo": 1, "id_estudiante": 2, "fecha_registro": "2026-09-08T20:55:54.858213", "registrado_por": 3, "id_calificacion": 38, "id_tipo_evaluacion": 3}	2026-09-08 20:55:54.858213
50	calificaciones	INSERT	39	app_uteq	\N	\N	{"valor": 9.00, "id_materia": 1, "id_periodo": 2, "id_estudiante": 1, "fecha_registro": "2026-09-08T20:55:54.858213", "registrado_por": 2, "id_calificacion": 39, "id_tipo_evaluacion": 1}	2026-09-08 20:55:54.858213
51	calificaciones	INSERT	40	app_uteq	\N	\N	{"valor": 8.50, "id_materia": 1, "id_periodo": 2, "id_estudiante": 1, "fecha_registro": "2026-09-08T20:55:54.858213", "registrado_por": 2, "id_calificacion": 40, "id_tipo_evaluacion": 2}	2026-09-08 20:55:54.858213
52	calificaciones	INSERT	41	app_uteq	\N	\N	{"valor": 7.00, "id_materia": 1, "id_periodo": 2, "id_estudiante": 2, "fecha_registro": "2026-09-08T20:55:54.858213", "registrado_por": 2, "id_calificacion": 41, "id_tipo_evaluacion": 1}	2026-09-08 20:55:54.858213
53	calificaciones	INSERT	42	app_uteq	1	\N	{"valor": 8.00, "id_materia": 2, "id_periodo": 2, "id_estudiante": 3, "fecha_registro": "2026-09-08T21:09:20.055172", "registrado_por": 1, "id_calificacion": 42, "id_tipo_evaluacion": 3}	2026-09-08 21:09:20.055172
54	calificaciones	INSERT	43	app_uteq	1	\N	{"valor": 10.00, "id_materia": 1, "id_periodo": 2, "id_estudiante": 3, "fecha_registro": "2026-09-08T21:09:45.661214", "registrado_por": 1, "id_calificacion": 43, "id_tipo_evaluacion": 3}	2026-09-08 21:09:45.661214
55	calificaciones	UPDATE	43	app_uteq	1	{"valor": 10.00, "id_materia": 1, "id_periodo": 2, "id_estudiante": 3, "fecha_registro": "2026-09-08T21:09:45.661214", "registrado_por": 1, "id_calificacion": 43, "id_tipo_evaluacion": 3}	{"valor": 8.00, "id_materia": 1, "id_periodo": 2, "id_estudiante": 3, "fecha_registro": "2026-09-08T21:10:04.871351", "registrado_por": 1, "id_calificacion": 43, "id_tipo_evaluacion": 3}	2026-09-08 21:10:04.871351
56	calificaciones	INSERT	45	app_uteq	1	\N	{"valor": 8.00, "id_materia": 1, "id_periodo": 2, "id_estudiante": 3, "fecha_registro": "2026-09-08T21:10:10.778141", "registrado_por": 1, "id_calificacion": 45, "id_tipo_evaluacion": 1}	2026-09-08 21:10:10.778141
57	calificaciones	UPDATE	43	app_uteq	1	{"valor": 8.00, "id_materia": 1, "id_periodo": 2, "id_estudiante": 3, "fecha_registro": "2026-09-08T21:10:04.871351", "registrado_por": 1, "id_calificacion": 43, "id_tipo_evaluacion": 3}	{"valor": 4.00, "id_materia": 1, "id_periodo": 2, "id_estudiante": 3, "fecha_registro": "2026-09-08T21:10:46.609303", "registrado_por": 1, "id_calificacion": 43, "id_tipo_evaluacion": 3}	2026-09-08 21:10:46.609303
58	usuarios	INSERT	4	app_uteq	\N	\N	{"email": "elena.romero@uteq.edu.ec", "activo": true, "id_rol": 2, "nombres": "Elena", "apellidos": "Romero", "id_usuario": 4, "password_hash": "$2b$10$5ZplphSVBSZonbr8i0ctR.BKbVakXpW0NfLt.PKzHppqTX.SSK6PG"}	2026-09-08 21:47:43.332564
59	usuarios	INSERT	5	app_uteq	\N	\N	{"email": "andres.torres@uteq.edu.ec", "activo": true, "id_rol": 2, "nombres": "Andres", "apellidos": "Torres", "id_usuario": 5, "password_hash": "$2b$10$5ZplphSVBSZonbr8i0ctR.BKbVakXpW0NfLt.PKzHppqTX.SSK6PG"}	2026-09-08 21:47:43.332564
60	usuarios	INSERT	6	app_uteq	\N	\N	{"email": "diana.vargas@uteq.edu.ec", "activo": true, "id_rol": 2, "nombres": "Diana", "apellidos": "Vargas", "id_usuario": 6, "password_hash": "$2b$10$5ZplphSVBSZonbr8i0ctR.BKbVakXpW0NfLt.PKzHppqTX.SSK6PG"}	2026-09-08 21:47:43.332564
61	matriculas	INSERT	16	app_uteq	\N	\N	{"id_periodo": 3, "id_matricula": 16, "id_estudiante": 1}	2026-09-08 21:47:43.373618
62	matriculas	INSERT	17	app_uteq	\N	\N	{"id_periodo": 3, "id_matricula": 17, "id_estudiante": 2}	2026-09-08 21:47:43.373618
63	matriculas	INSERT	18	app_uteq	\N	\N	{"id_periodo": 3, "id_matricula": 18, "id_estudiante": 3}	2026-09-08 21:47:43.373618
64	matriculas	INSERT	19	app_uteq	\N	\N	{"id_periodo": 1, "id_matricula": 19, "id_estudiante": 4}	2026-09-08 21:47:43.373618
65	matriculas	INSERT	20	app_uteq	\N	\N	{"id_periodo": 2, "id_matricula": 20, "id_estudiante": 4}	2026-09-08 21:47:43.373618
66	matriculas	INSERT	21	app_uteq	\N	\N	{"id_periodo": 3, "id_matricula": 21, "id_estudiante": 4}	2026-09-08 21:47:43.373618
67	matriculas	INSERT	22	app_uteq	\N	\N	{"id_periodo": 1, "id_matricula": 22, "id_estudiante": 5}	2026-09-08 21:47:43.373618
68	matriculas	INSERT	23	app_uteq	\N	\N	{"id_periodo": 2, "id_matricula": 23, "id_estudiante": 5}	2026-09-08 21:47:43.373618
69	matriculas	INSERT	24	app_uteq	\N	\N	{"id_periodo": 3, "id_matricula": 24, "id_estudiante": 5}	2026-09-08 21:47:43.373618
70	matriculas	INSERT	25	app_uteq	\N	\N	{"id_periodo": 1, "id_matricula": 25, "id_estudiante": 6}	2026-09-08 21:47:43.373618
71	matriculas	INSERT	26	app_uteq	\N	\N	{"id_periodo": 2, "id_matricula": 26, "id_estudiante": 6}	2026-09-08 21:47:43.373618
72	matriculas	INSERT	27	app_uteq	\N	\N	{"id_periodo": 3, "id_matricula": 27, "id_estudiante": 6}	2026-09-08 21:47:43.373618
73	matriculas	INSERT	28	app_uteq	\N	\N	{"id_periodo": 1, "id_matricula": 28, "id_estudiante": 7}	2026-09-08 21:47:43.373618
74	matriculas	INSERT	29	app_uteq	\N	\N	{"id_periodo": 2, "id_matricula": 29, "id_estudiante": 7}	2026-09-08 21:47:43.373618
75	matriculas	INSERT	30	app_uteq	\N	\N	{"id_periodo": 3, "id_matricula": 30, "id_estudiante": 7}	2026-09-08 21:47:43.373618
76	matriculas	INSERT	31	app_uteq	\N	\N	{"id_periodo": 1, "id_matricula": 31, "id_estudiante": 8}	2026-09-08 21:47:43.373618
77	matriculas	INSERT	32	app_uteq	\N	\N	{"id_periodo": 2, "id_matricula": 32, "id_estudiante": 8}	2026-09-08 21:47:43.373618
78	matriculas	INSERT	33	app_uteq	\N	\N	{"id_periodo": 3, "id_matricula": 33, "id_estudiante": 8}	2026-09-08 21:47:43.373618
79	matriculas	INSERT	34	app_uteq	\N	\N	{"id_periodo": 1, "id_matricula": 34, "id_estudiante": 9}	2026-09-08 21:47:43.373618
80	matriculas	INSERT	35	app_uteq	\N	\N	{"id_periodo": 2, "id_matricula": 35, "id_estudiante": 9}	2026-09-08 21:47:43.373618
81	matriculas	INSERT	36	app_uteq	\N	\N	{"id_periodo": 3, "id_matricula": 36, "id_estudiante": 9}	2026-09-08 21:47:43.373618
82	matriculas	INSERT	37	app_uteq	\N	\N	{"id_periodo": 1, "id_matricula": 37, "id_estudiante": 10}	2026-09-08 21:47:43.373618
83	matriculas	INSERT	38	app_uteq	\N	\N	{"id_periodo": 2, "id_matricula": 38, "id_estudiante": 10}	2026-09-08 21:47:43.373618
84	matriculas	INSERT	39	app_uteq	\N	\N	{"id_periodo": 3, "id_matricula": 39, "id_estudiante": 10}	2026-09-08 21:47:43.373618
85	calificaciones	INSERT	47	app_uteq	\N	\N	{"valor": 7.50, "id_materia": 1, "id_periodo": 1, "id_estudiante": 4, "fecha_registro": "2026-09-08T21:47:43.381682", "registrado_por": 2, "id_calificacion": 47, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.381682
86	calificaciones	INSERT	48	app_uteq	\N	\N	{"valor": 8.00, "id_materia": 1, "id_periodo": 1, "id_estudiante": 4, "fecha_registro": "2026-09-08T21:47:43.381682", "registrado_por": 2, "id_calificacion": 48, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.381682
87	calificaciones	INSERT	49	app_uteq	\N	\N	{"valor": 7.80, "id_materia": 1, "id_periodo": 1, "id_estudiante": 4, "fecha_registro": "2026-09-08T21:47:43.381682", "registrado_por": 2, "id_calificacion": 49, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.381682
88	calificaciones	INSERT	50	app_uteq	\N	\N	{"valor": 8.20, "id_materia": 2, "id_periodo": 1, "id_estudiante": 4, "fecha_registro": "2026-09-08T21:47:43.388322", "registrado_por": 3, "id_calificacion": 50, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.388322
89	calificaciones	INSERT	51	app_uteq	\N	\N	{"valor": 7.90, "id_materia": 2, "id_periodo": 1, "id_estudiante": 4, "fecha_registro": "2026-09-08T21:47:43.388322", "registrado_por": 3, "id_calificacion": 51, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.388322
90	calificaciones	INSERT	52	app_uteq	\N	\N	{"valor": 8.50, "id_materia": 2, "id_periodo": 1, "id_estudiante": 4, "fecha_registro": "2026-09-08T21:47:43.388322", "registrado_por": 3, "id_calificacion": 52, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.388322
91	calificaciones	INSERT	53	app_uteq	\N	\N	{"valor": 5.50, "id_materia": 1, "id_periodo": 1, "id_estudiante": 5, "fecha_registro": "2026-09-08T21:47:43.390044", "registrado_por": 2, "id_calificacion": 53, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.390044
92	calificaciones	INSERT	54	app_uteq	\N	\N	{"valor": 6.00, "id_materia": 1, "id_periodo": 1, "id_estudiante": 5, "fecha_registro": "2026-09-08T21:47:43.390044", "registrado_por": 2, "id_calificacion": 54, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.390044
93	calificaciones	INSERT	55	app_uteq	\N	\N	{"valor": 6.50, "id_materia": 1, "id_periodo": 1, "id_estudiante": 5, "fecha_registro": "2026-09-08T21:47:43.390044", "registrado_por": 2, "id_calificacion": 55, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.390044
94	calificaciones	INSERT	56	app_uteq	\N	\N	{"valor": 6.80, "id_materia": 2, "id_periodo": 1, "id_estudiante": 5, "fecha_registro": "2026-09-08T21:47:43.390916", "registrado_por": 3, "id_calificacion": 56, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.390916
95	calificaciones	INSERT	57	app_uteq	\N	\N	{"valor": 7.00, "id_materia": 2, "id_periodo": 1, "id_estudiante": 5, "fecha_registro": "2026-09-08T21:47:43.390916", "registrado_por": 3, "id_calificacion": 57, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.390916
96	calificaciones	INSERT	58	app_uteq	\N	\N	{"valor": 7.20, "id_materia": 2, "id_periodo": 1, "id_estudiante": 5, "fecha_registro": "2026-09-08T21:47:43.390916", "registrado_por": 3, "id_calificacion": 58, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.390916
97	calificaciones	INSERT	59	app_uteq	\N	\N	{"valor": 9.00, "id_materia": 1, "id_periodo": 1, "id_estudiante": 6, "fecha_registro": "2026-09-08T21:47:43.391911", "registrado_por": 2, "id_calificacion": 59, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.391911
98	calificaciones	INSERT	60	app_uteq	\N	\N	{"valor": 9.50, "id_materia": 1, "id_periodo": 1, "id_estudiante": 6, "fecha_registro": "2026-09-08T21:47:43.391911", "registrado_por": 2, "id_calificacion": 60, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.391911
99	calificaciones	INSERT	61	app_uteq	\N	\N	{"valor": 9.20, "id_materia": 1, "id_periodo": 1, "id_estudiante": 6, "fecha_registro": "2026-09-08T21:47:43.391911", "registrado_por": 2, "id_calificacion": 61, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.391911
100	calificaciones	INSERT	62	app_uteq	\N	\N	{"valor": 8.80, "id_materia": 2, "id_periodo": 1, "id_estudiante": 6, "fecha_registro": "2026-09-08T21:47:43.392797", "registrado_por": 3, "id_calificacion": 62, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.392797
101	calificaciones	INSERT	63	app_uteq	\N	\N	{"valor": 9.10, "id_materia": 2, "id_periodo": 1, "id_estudiante": 6, "fecha_registro": "2026-09-08T21:47:43.392797", "registrado_por": 3, "id_calificacion": 63, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.392797
102	calificaciones	INSERT	64	app_uteq	\N	\N	{"valor": 8.70, "id_materia": 2, "id_periodo": 1, "id_estudiante": 6, "fecha_registro": "2026-09-08T21:47:43.392797", "registrado_por": 3, "id_calificacion": 64, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.392797
103	calificaciones	INSERT	65	app_uteq	\N	\N	{"valor": 4.50, "id_materia": 1, "id_periodo": 1, "id_estudiante": 7, "fecha_registro": "2026-09-08T21:47:43.393636", "registrado_por": 2, "id_calificacion": 65, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.393636
104	calificaciones	INSERT	66	app_uteq	\N	\N	{"valor": 5.00, "id_materia": 1, "id_periodo": 1, "id_estudiante": 7, "fecha_registro": "2026-09-08T21:47:43.393636", "registrado_por": 2, "id_calificacion": 66, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.393636
105	calificaciones	INSERT	67	app_uteq	\N	\N	{"valor": 5.50, "id_materia": 1, "id_periodo": 1, "id_estudiante": 7, "fecha_registro": "2026-09-08T21:47:43.393636", "registrado_por": 2, "id_calificacion": 67, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.393636
106	calificaciones	INSERT	68	app_uteq	\N	\N	{"valor": 6.00, "id_materia": 2, "id_periodo": 1, "id_estudiante": 7, "fecha_registro": "2026-09-08T21:47:43.394767", "registrado_por": 3, "id_calificacion": 68, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.394767
107	calificaciones	INSERT	69	app_uteq	\N	\N	{"valor": 6.50, "id_materia": 2, "id_periodo": 1, "id_estudiante": 7, "fecha_registro": "2026-09-08T21:47:43.394767", "registrado_por": 3, "id_calificacion": 69, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.394767
108	calificaciones	INSERT	70	app_uteq	\N	\N	{"valor": 7.00, "id_materia": 2, "id_periodo": 1, "id_estudiante": 7, "fecha_registro": "2026-09-08T21:47:43.394767", "registrado_por": 3, "id_calificacion": 70, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.394767
109	calificaciones	INSERT	71	app_uteq	\N	\N	{"valor": 7.80, "id_materia": 1, "id_periodo": 1, "id_estudiante": 8, "fecha_registro": "2026-09-08T21:47:43.395478", "registrado_por": 2, "id_calificacion": 71, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.395478
110	calificaciones	INSERT	72	app_uteq	\N	\N	{"valor": 8.20, "id_materia": 1, "id_periodo": 1, "id_estudiante": 8, "fecha_registro": "2026-09-08T21:47:43.395478", "registrado_por": 2, "id_calificacion": 72, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.395478
111	calificaciones	INSERT	73	app_uteq	\N	\N	{"valor": 8.00, "id_materia": 1, "id_periodo": 1, "id_estudiante": 8, "fecha_registro": "2026-09-08T21:47:43.395478", "registrado_por": 2, "id_calificacion": 73, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.395478
112	calificaciones	INSERT	74	app_uteq	\N	\N	{"valor": 8.50, "id_materia": 2, "id_periodo": 1, "id_estudiante": 8, "fecha_registro": "2026-09-08T21:47:43.396374", "registrado_por": 3, "id_calificacion": 74, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.396374
113	calificaciones	INSERT	75	app_uteq	\N	\N	{"valor": 8.00, "id_materia": 2, "id_periodo": 1, "id_estudiante": 8, "fecha_registro": "2026-09-08T21:47:43.396374", "registrado_por": 3, "id_calificacion": 75, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.396374
114	calificaciones	INSERT	76	app_uteq	\N	\N	{"valor": 8.30, "id_materia": 2, "id_periodo": 1, "id_estudiante": 8, "fecha_registro": "2026-09-08T21:47:43.396374", "registrado_por": 3, "id_calificacion": 76, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.396374
115	calificaciones	INSERT	77	app_uteq	\N	\N	{"valor": 6.50, "id_materia": 1, "id_periodo": 1, "id_estudiante": 9, "fecha_registro": "2026-09-08T21:47:43.397683", "registrado_por": 2, "id_calificacion": 77, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.397683
116	calificaciones	INSERT	78	app_uteq	\N	\N	{"valor": 7.00, "id_materia": 1, "id_periodo": 1, "id_estudiante": 9, "fecha_registro": "2026-09-08T21:47:43.397683", "registrado_por": 2, "id_calificacion": 78, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.397683
117	calificaciones	INSERT	79	app_uteq	\N	\N	{"valor": 7.50, "id_materia": 1, "id_periodo": 1, "id_estudiante": 9, "fecha_registro": "2026-09-08T21:47:43.397683", "registrado_por": 2, "id_calificacion": 79, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.397683
118	calificaciones	INSERT	80	app_uteq	\N	\N	{"valor": 7.20, "id_materia": 2, "id_periodo": 1, "id_estudiante": 9, "fecha_registro": "2026-09-08T21:47:43.398998", "registrado_por": 3, "id_calificacion": 80, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.398998
119	calificaciones	INSERT	81	app_uteq	\N	\N	{"valor": 7.80, "id_materia": 2, "id_periodo": 1, "id_estudiante": 9, "fecha_registro": "2026-09-08T21:47:43.398998", "registrado_por": 3, "id_calificacion": 81, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.398998
120	calificaciones	INSERT	82	app_uteq	\N	\N	{"valor": 7.50, "id_materia": 2, "id_periodo": 1, "id_estudiante": 9, "fecha_registro": "2026-09-08T21:47:43.398998", "registrado_por": 3, "id_calificacion": 82, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.398998
121	calificaciones	INSERT	83	app_uteq	\N	\N	{"valor": 8.00, "id_materia": 1, "id_periodo": 1, "id_estudiante": 10, "fecha_registro": "2026-09-08T21:47:43.399909", "registrado_por": 2, "id_calificacion": 83, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.399909
122	calificaciones	INSERT	84	app_uteq	\N	\N	{"valor": 7.50, "id_materia": 1, "id_periodo": 1, "id_estudiante": 10, "fecha_registro": "2026-09-08T21:47:43.399909", "registrado_por": 2, "id_calificacion": 84, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.399909
123	calificaciones	INSERT	85	app_uteq	\N	\N	{"valor": 8.20, "id_materia": 1, "id_periodo": 1, "id_estudiante": 10, "fecha_registro": "2026-09-08T21:47:43.399909", "registrado_por": 2, "id_calificacion": 85, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.399909
124	calificaciones	INSERT	86	app_uteq	\N	\N	{"valor": 7.80, "id_materia": 2, "id_periodo": 1, "id_estudiante": 10, "fecha_registro": "2026-09-08T21:47:43.400804", "registrado_por": 3, "id_calificacion": 86, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.400804
125	calificaciones	INSERT	87	app_uteq	\N	\N	{"valor": 8.00, "id_materia": 2, "id_periodo": 1, "id_estudiante": 10, "fecha_registro": "2026-09-08T21:47:43.400804", "registrado_por": 3, "id_calificacion": 87, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.400804
126	calificaciones	INSERT	88	app_uteq	\N	\N	{"valor": 8.50, "id_materia": 2, "id_periodo": 1, "id_estudiante": 10, "fecha_registro": "2026-09-08T21:47:43.400804", "registrado_por": 3, "id_calificacion": 88, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.400804
127	calificaciones	INSERT	89	app_uteq	\N	\N	{"valor": 8.00, "id_materia": 1, "id_periodo": 2, "id_estudiante": 4, "fecha_registro": "2026-09-08T21:47:43.40209", "registrado_por": 2, "id_calificacion": 89, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.40209
128	calificaciones	INSERT	90	app_uteq	\N	\N	{"valor": 8.50, "id_materia": 1, "id_periodo": 2, "id_estudiante": 4, "fecha_registro": "2026-09-08T21:47:43.40209", "registrado_por": 2, "id_calificacion": 90, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.40209
129	calificaciones	INSERT	91	app_uteq	\N	\N	{"valor": 8.20, "id_materia": 1, "id_periodo": 2, "id_estudiante": 4, "fecha_registro": "2026-09-08T21:47:43.40209", "registrado_por": 2, "id_calificacion": 91, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.40209
130	calificaciones	INSERT	92	app_uteq	\N	\N	{"valor": 7.50, "id_materia": 2, "id_periodo": 2, "id_estudiante": 4, "fecha_registro": "2026-09-08T21:47:43.402795", "registrado_por": 3, "id_calificacion": 92, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.402795
131	calificaciones	INSERT	93	app_uteq	\N	\N	{"valor": 8.00, "id_materia": 2, "id_periodo": 2, "id_estudiante": 4, "fecha_registro": "2026-09-08T21:47:43.402795", "registrado_por": 3, "id_calificacion": 93, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.402795
132	calificaciones	INSERT	94	app_uteq	\N	\N	{"valor": 7.80, "id_materia": 2, "id_periodo": 2, "id_estudiante": 4, "fecha_registro": "2026-09-08T21:47:43.402795", "registrado_por": 3, "id_calificacion": 94, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.402795
133	calificaciones	INSERT	95	app_uteq	\N	\N	{"valor": 6.00, "id_materia": 1, "id_periodo": 2, "id_estudiante": 5, "fecha_registro": "2026-09-08T21:47:43.40368", "registrado_por": 2, "id_calificacion": 95, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.40368
134	calificaciones	INSERT	96	app_uteq	\N	\N	{"valor": 6.50, "id_materia": 1, "id_periodo": 2, "id_estudiante": 5, "fecha_registro": "2026-09-08T21:47:43.40368", "registrado_por": 2, "id_calificacion": 96, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.40368
135	calificaciones	INSERT	97	app_uteq	\N	\N	{"valor": 7.00, "id_materia": 1, "id_periodo": 2, "id_estudiante": 5, "fecha_registro": "2026-09-08T21:47:43.40368", "registrado_por": 2, "id_calificacion": 97, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.40368
136	calificaciones	INSERT	98	app_uteq	\N	\N	{"valor": 7.00, "id_materia": 2, "id_periodo": 2, "id_estudiante": 5, "fecha_registro": "2026-09-08T21:47:43.404667", "registrado_por": 3, "id_calificacion": 98, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.404667
137	calificaciones	INSERT	99	app_uteq	\N	\N	{"valor": 7.50, "id_materia": 2, "id_periodo": 2, "id_estudiante": 5, "fecha_registro": "2026-09-08T21:47:43.404667", "registrado_por": 3, "id_calificacion": 99, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.404667
138	calificaciones	INSERT	100	app_uteq	\N	\N	{"valor": 7.20, "id_materia": 2, "id_periodo": 2, "id_estudiante": 5, "fecha_registro": "2026-09-08T21:47:43.404667", "registrado_por": 3, "id_calificacion": 100, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.404667
139	calificaciones	INSERT	101	app_uteq	\N	\N	{"valor": 9.20, "id_materia": 1, "id_periodo": 2, "id_estudiante": 6, "fecha_registro": "2026-09-08T21:47:43.405439", "registrado_por": 2, "id_calificacion": 101, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.405439
140	calificaciones	INSERT	102	app_uteq	\N	\N	{"valor": 9.00, "id_materia": 1, "id_periodo": 2, "id_estudiante": 6, "fecha_registro": "2026-09-08T21:47:43.405439", "registrado_por": 2, "id_calificacion": 102, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.405439
141	calificaciones	INSERT	103	app_uteq	\N	\N	{"valor": 9.50, "id_materia": 1, "id_periodo": 2, "id_estudiante": 6, "fecha_registro": "2026-09-08T21:47:43.405439", "registrado_por": 2, "id_calificacion": 103, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.405439
142	calificaciones	INSERT	104	app_uteq	\N	\N	{"valor": 9.00, "id_materia": 2, "id_periodo": 2, "id_estudiante": 6, "fecha_registro": "2026-09-08T21:47:43.406211", "registrado_por": 3, "id_calificacion": 104, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.406211
143	calificaciones	INSERT	105	app_uteq	\N	\N	{"valor": 9.30, "id_materia": 2, "id_periodo": 2, "id_estudiante": 6, "fecha_registro": "2026-09-08T21:47:43.406211", "registrado_por": 3, "id_calificacion": 105, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.406211
144	calificaciones	INSERT	106	app_uteq	\N	\N	{"valor": 9.10, "id_materia": 2, "id_periodo": 2, "id_estudiante": 6, "fecha_registro": "2026-09-08T21:47:43.406211", "registrado_por": 3, "id_calificacion": 106, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.406211
145	calificaciones	INSERT	107	app_uteq	\N	\N	{"valor": 5.00, "id_materia": 1, "id_periodo": 2, "id_estudiante": 7, "fecha_registro": "2026-09-08T21:47:43.409667", "registrado_por": 2, "id_calificacion": 107, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.409667
146	calificaciones	INSERT	108	app_uteq	\N	\N	{"valor": 5.50, "id_materia": 1, "id_periodo": 2, "id_estudiante": 7, "fecha_registro": "2026-09-08T21:47:43.409667", "registrado_por": 2, "id_calificacion": 108, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.409667
147	calificaciones	INSERT	109	app_uteq	\N	\N	{"valor": 6.00, "id_materia": 1, "id_periodo": 2, "id_estudiante": 7, "fecha_registro": "2026-09-08T21:47:43.409667", "registrado_por": 2, "id_calificacion": 109, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.409667
148	calificaciones	INSERT	110	app_uteq	\N	\N	{"valor": 6.50, "id_materia": 2, "id_periodo": 2, "id_estudiante": 7, "fecha_registro": "2026-09-08T21:47:43.410554", "registrado_por": 3, "id_calificacion": 110, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.410554
149	calificaciones	INSERT	111	app_uteq	\N	\N	{"valor": 7.00, "id_materia": 2, "id_periodo": 2, "id_estudiante": 7, "fecha_registro": "2026-09-08T21:47:43.410554", "registrado_por": 3, "id_calificacion": 111, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.410554
150	calificaciones	INSERT	112	app_uteq	\N	\N	{"valor": 7.20, "id_materia": 2, "id_periodo": 2, "id_estudiante": 7, "fecha_registro": "2026-09-08T21:47:43.410554", "registrado_por": 3, "id_calificacion": 112, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.410554
151	calificaciones	INSERT	113	app_uteq	\N	\N	{"valor": 8.00, "id_materia": 1, "id_periodo": 2, "id_estudiante": 8, "fecha_registro": "2026-09-08T21:47:43.41125", "registrado_por": 2, "id_calificacion": 113, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.41125
152	calificaciones	INSERT	114	app_uteq	\N	\N	{"valor": 8.30, "id_materia": 1, "id_periodo": 2, "id_estudiante": 8, "fecha_registro": "2026-09-08T21:47:43.41125", "registrado_por": 2, "id_calificacion": 114, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.41125
153	calificaciones	INSERT	115	app_uteq	\N	\N	{"valor": 8.50, "id_materia": 1, "id_periodo": 2, "id_estudiante": 8, "fecha_registro": "2026-09-08T21:47:43.41125", "registrado_por": 2, "id_calificacion": 115, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.41125
154	calificaciones	INSERT	116	app_uteq	\N	\N	{"valor": 8.20, "id_materia": 2, "id_periodo": 2, "id_estudiante": 8, "fecha_registro": "2026-09-08T21:47:43.412157", "registrado_por": 3, "id_calificacion": 116, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.412157
155	calificaciones	INSERT	117	app_uteq	\N	\N	{"valor": 8.00, "id_materia": 2, "id_periodo": 2, "id_estudiante": 8, "fecha_registro": "2026-09-08T21:47:43.412157", "registrado_por": 3, "id_calificacion": 117, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.412157
156	calificaciones	INSERT	118	app_uteq	\N	\N	{"valor": 8.50, "id_materia": 2, "id_periodo": 2, "id_estudiante": 8, "fecha_registro": "2026-09-08T21:47:43.412157", "registrado_por": 3, "id_calificacion": 118, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.412157
157	calificaciones	INSERT	119	app_uteq	\N	\N	{"valor": 7.00, "id_materia": 1, "id_periodo": 2, "id_estudiante": 9, "fecha_registro": "2026-09-08T21:47:43.413058", "registrado_por": 2, "id_calificacion": 119, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.413058
158	calificaciones	INSERT	120	app_uteq	\N	\N	{"valor": 7.50, "id_materia": 1, "id_periodo": 2, "id_estudiante": 9, "fecha_registro": "2026-09-08T21:47:43.413058", "registrado_por": 2, "id_calificacion": 120, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.413058
159	calificaciones	INSERT	121	app_uteq	\N	\N	{"valor": 7.20, "id_materia": 1, "id_periodo": 2, "id_estudiante": 9, "fecha_registro": "2026-09-08T21:47:43.413058", "registrado_por": 2, "id_calificacion": 121, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.413058
160	calificaciones	INSERT	122	app_uteq	\N	\N	{"valor": 7.50, "id_materia": 2, "id_periodo": 2, "id_estudiante": 9, "fecha_registro": "2026-09-08T21:47:43.416394", "registrado_por": 3, "id_calificacion": 122, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.416394
161	calificaciones	INSERT	123	app_uteq	\N	\N	{"valor": 8.00, "id_materia": 2, "id_periodo": 2, "id_estudiante": 9, "fecha_registro": "2026-09-08T21:47:43.416394", "registrado_por": 3, "id_calificacion": 123, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.416394
162	calificaciones	INSERT	124	app_uteq	\N	\N	{"valor": 7.80, "id_materia": 2, "id_periodo": 2, "id_estudiante": 9, "fecha_registro": "2026-09-08T21:47:43.416394", "registrado_por": 3, "id_calificacion": 124, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.416394
163	calificaciones	INSERT	125	app_uteq	\N	\N	{"valor": 7.80, "id_materia": 1, "id_periodo": 2, "id_estudiante": 10, "fecha_registro": "2026-09-08T21:47:43.417659", "registrado_por": 2, "id_calificacion": 125, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.417659
164	calificaciones	INSERT	126	app_uteq	\N	\N	{"valor": 8.00, "id_materia": 1, "id_periodo": 2, "id_estudiante": 10, "fecha_registro": "2026-09-08T21:47:43.417659", "registrado_por": 2, "id_calificacion": 126, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.417659
165	calificaciones	INSERT	127	app_uteq	\N	\N	{"valor": 8.30, "id_materia": 1, "id_periodo": 2, "id_estudiante": 10, "fecha_registro": "2026-09-08T21:47:43.417659", "registrado_por": 2, "id_calificacion": 127, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.417659
166	calificaciones	INSERT	128	app_uteq	\N	\N	{"valor": 8.00, "id_materia": 2, "id_periodo": 2, "id_estudiante": 10, "fecha_registro": "2026-09-08T21:47:43.419792", "registrado_por": 3, "id_calificacion": 128, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.419792
167	calificaciones	INSERT	129	app_uteq	\N	\N	{"valor": 8.50, "id_materia": 2, "id_periodo": 2, "id_estudiante": 10, "fecha_registro": "2026-09-08T21:47:43.419792", "registrado_por": 3, "id_calificacion": 129, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.419792
168	calificaciones	INSERT	130	app_uteq	\N	\N	{"valor": 8.20, "id_materia": 2, "id_periodo": 2, "id_estudiante": 10, "fecha_registro": "2026-09-08T21:47:43.419792", "registrado_por": 3, "id_calificacion": 130, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.419792
169	calificaciones	INSERT	132	app_uteq	\N	\N	{"valor": 8.80, "id_materia": 1, "id_periodo": 3, "id_estudiante": 1, "fecha_registro": "2026-09-08T21:47:43.422619", "registrado_por": 2, "id_calificacion": 132, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.422619
170	calificaciones	INSERT	133	app_uteq	\N	\N	{"valor": 9.20, "id_materia": 1, "id_periodo": 3, "id_estudiante": 1, "fecha_registro": "2026-09-08T21:47:43.422619", "registrado_por": 2, "id_calificacion": 133, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.422619
171	calificaciones	INSERT	134	app_uteq	\N	\N	{"valor": 9.00, "id_materia": 1, "id_periodo": 3, "id_estudiante": 1, "fecha_registro": "2026-09-08T21:47:43.422619", "registrado_por": 2, "id_calificacion": 134, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.422619
172	calificaciones	INSERT	135	app_uteq	\N	\N	{"valor": 9.00, "id_materia": 2, "id_periodo": 3, "id_estudiante": 1, "fecha_registro": "2026-09-08T21:47:43.423585", "registrado_por": 3, "id_calificacion": 135, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.423585
173	calificaciones	INSERT	136	app_uteq	\N	\N	{"valor": 9.50, "id_materia": 2, "id_periodo": 3, "id_estudiante": 1, "fecha_registro": "2026-09-08T21:47:43.423585", "registrado_por": 3, "id_calificacion": 136, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.423585
174	calificaciones	INSERT	137	app_uteq	\N	\N	{"valor": 9.30, "id_materia": 2, "id_periodo": 3, "id_estudiante": 1, "fecha_registro": "2026-09-08T21:47:43.423585", "registrado_por": 3, "id_calificacion": 137, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.423585
175	calificaciones	INSERT	138	app_uteq	\N	\N	{"valor": 7.00, "id_materia": 1, "id_periodo": 3, "id_estudiante": 2, "fecha_registro": "2026-09-08T21:47:43.424381", "registrado_por": 2, "id_calificacion": 138, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.424381
176	calificaciones	INSERT	139	app_uteq	\N	\N	{"valor": 7.50, "id_materia": 1, "id_periodo": 3, "id_estudiante": 2, "fecha_registro": "2026-09-08T21:47:43.424381", "registrado_por": 2, "id_calificacion": 139, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.424381
177	calificaciones	INSERT	140	app_uteq	\N	\N	{"valor": 7.20, "id_materia": 1, "id_periodo": 3, "id_estudiante": 2, "fecha_registro": "2026-09-08T21:47:43.424381", "registrado_por": 2, "id_calificacion": 140, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.424381
178	calificaciones	INSERT	141	app_uteq	\N	\N	{"valor": 7.50, "id_materia": 2, "id_periodo": 3, "id_estudiante": 2, "fecha_registro": "2026-09-08T21:47:43.425166", "registrado_por": 3, "id_calificacion": 141, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.425166
179	calificaciones	INSERT	142	app_uteq	\N	\N	{"valor": 8.00, "id_materia": 2, "id_periodo": 3, "id_estudiante": 2, "fecha_registro": "2026-09-08T21:47:43.425166", "registrado_por": 3, "id_calificacion": 142, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.425166
180	calificaciones	INSERT	143	app_uteq	\N	\N	{"valor": 7.80, "id_materia": 2, "id_periodo": 3, "id_estudiante": 2, "fecha_registro": "2026-09-08T21:47:43.425166", "registrado_por": 3, "id_calificacion": 143, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.425166
181	calificaciones	INSERT	144	app_uteq	\N	\N	{"valor": 8.50, "id_materia": 1, "id_periodo": 3, "id_estudiante": 3, "fecha_registro": "2026-09-08T21:47:43.426002", "registrado_por": 2, "id_calificacion": 144, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.426002
182	calificaciones	INSERT	145	app_uteq	\N	\N	{"valor": 8.80, "id_materia": 1, "id_periodo": 3, "id_estudiante": 3, "fecha_registro": "2026-09-08T21:47:43.426002", "registrado_por": 2, "id_calificacion": 145, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.426002
183	calificaciones	INSERT	146	app_uteq	\N	\N	{"valor": 9.00, "id_materia": 1, "id_periodo": 3, "id_estudiante": 3, "fecha_registro": "2026-09-08T21:47:43.426002", "registrado_por": 2, "id_calificacion": 146, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.426002
184	calificaciones	INSERT	147	app_uteq	\N	\N	{"valor": 8.80, "id_materia": 2, "id_periodo": 3, "id_estudiante": 3, "fecha_registro": "2026-09-08T21:47:43.426673", "registrado_por": 3, "id_calificacion": 147, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.426673
185	calificaciones	INSERT	148	app_uteq	\N	\N	{"valor": 9.00, "id_materia": 2, "id_periodo": 3, "id_estudiante": 3, "fecha_registro": "2026-09-08T21:47:43.426673", "registrado_por": 3, "id_calificacion": 148, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.426673
186	calificaciones	INSERT	149	app_uteq	\N	\N	{"valor": 8.50, "id_materia": 2, "id_periodo": 3, "id_estudiante": 3, "fecha_registro": "2026-09-08T21:47:43.426673", "registrado_por": 3, "id_calificacion": 149, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.426673
187	calificaciones	INSERT	150	app_uteq	\N	\N	{"valor": 8.00, "id_materia": 1, "id_periodo": 3, "id_estudiante": 4, "fecha_registro": "2026-09-08T21:47:43.428621", "registrado_por": 2, "id_calificacion": 150, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.428621
188	calificaciones	INSERT	151	app_uteq	\N	\N	{"valor": 8.50, "id_materia": 1, "id_periodo": 3, "id_estudiante": 4, "fecha_registro": "2026-09-08T21:47:43.428621", "registrado_por": 2, "id_calificacion": 151, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.428621
189	calificaciones	INSERT	152	app_uteq	\N	\N	{"valor": 8.30, "id_materia": 1, "id_periodo": 3, "id_estudiante": 4, "fecha_registro": "2026-09-08T21:47:43.428621", "registrado_por": 2, "id_calificacion": 152, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.428621
190	calificaciones	INSERT	153	app_uteq	\N	\N	{"valor": 8.50, "id_materia": 2, "id_periodo": 3, "id_estudiante": 4, "fecha_registro": "2026-09-08T21:47:43.430648", "registrado_por": 3, "id_calificacion": 153, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.430648
191	calificaciones	INSERT	154	app_uteq	\N	\N	{"valor": 8.00, "id_materia": 2, "id_periodo": 3, "id_estudiante": 4, "fecha_registro": "2026-09-08T21:47:43.430648", "registrado_por": 3, "id_calificacion": 154, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.430648
192	calificaciones	INSERT	155	app_uteq	\N	\N	{"valor": 8.80, "id_materia": 2, "id_periodo": 3, "id_estudiante": 4, "fecha_registro": "2026-09-08T21:47:43.430648", "registrado_por": 3, "id_calificacion": 155, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.430648
193	calificaciones	INSERT	156	app_uteq	\N	\N	{"valor": 6.50, "id_materia": 1, "id_periodo": 3, "id_estudiante": 5, "fecha_registro": "2026-09-08T21:47:43.431677", "registrado_por": 2, "id_calificacion": 156, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.431677
194	calificaciones	INSERT	157	app_uteq	\N	\N	{"valor": 7.00, "id_materia": 1, "id_periodo": 3, "id_estudiante": 5, "fecha_registro": "2026-09-08T21:47:43.431677", "registrado_por": 2, "id_calificacion": 157, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.431677
195	calificaciones	INSERT	158	app_uteq	\N	\N	{"valor": 7.50, "id_materia": 1, "id_periodo": 3, "id_estudiante": 5, "fecha_registro": "2026-09-08T21:47:43.431677", "registrado_por": 2, "id_calificacion": 158, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.431677
196	calificaciones	INSERT	159	app_uteq	\N	\N	{"valor": 7.20, "id_materia": 2, "id_periodo": 3, "id_estudiante": 5, "fecha_registro": "2026-09-08T21:47:43.432771", "registrado_por": 3, "id_calificacion": 159, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.432771
197	calificaciones	INSERT	160	app_uteq	\N	\N	{"valor": 7.50, "id_materia": 2, "id_periodo": 3, "id_estudiante": 5, "fecha_registro": "2026-09-08T21:47:43.432771", "registrado_por": 3, "id_calificacion": 160, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.432771
198	calificaciones	INSERT	161	app_uteq	\N	\N	{"valor": 7.80, "id_materia": 2, "id_periodo": 3, "id_estudiante": 5, "fecha_registro": "2026-09-08T21:47:43.432771", "registrado_por": 3, "id_calificacion": 161, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.432771
199	calificaciones	INSERT	162	app_uteq	\N	\N	{"valor": 9.00, "id_materia": 1, "id_periodo": 3, "id_estudiante": 6, "fecha_registro": "2026-09-08T21:47:43.433758", "registrado_por": 2, "id_calificacion": 162, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.433758
200	calificaciones	INSERT	163	app_uteq	\N	\N	{"valor": 9.30, "id_materia": 1, "id_periodo": 3, "id_estudiante": 6, "fecha_registro": "2026-09-08T21:47:43.433758", "registrado_por": 2, "id_calificacion": 163, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.433758
201	calificaciones	INSERT	164	app_uteq	\N	\N	{"valor": 9.50, "id_materia": 1, "id_periodo": 3, "id_estudiante": 6, "fecha_registro": "2026-09-08T21:47:43.433758", "registrado_por": 2, "id_calificacion": 164, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.433758
202	calificaciones	INSERT	165	app_uteq	\N	\N	{"valor": 9.20, "id_materia": 2, "id_periodo": 3, "id_estudiante": 6, "fecha_registro": "2026-09-08T21:47:43.434777", "registrado_por": 3, "id_calificacion": 165, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.434777
203	calificaciones	INSERT	166	app_uteq	\N	\N	{"valor": 9.00, "id_materia": 2, "id_periodo": 3, "id_estudiante": 6, "fecha_registro": "2026-09-08T21:47:43.434777", "registrado_por": 3, "id_calificacion": 166, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.434777
204	calificaciones	INSERT	167	app_uteq	\N	\N	{"valor": 9.40, "id_materia": 2, "id_periodo": 3, "id_estudiante": 6, "fecha_registro": "2026-09-08T21:47:43.434777", "registrado_por": 3, "id_calificacion": 167, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.434777
205	calificaciones	INSERT	168	app_uteq	\N	\N	{"valor": 5.50, "id_materia": 1, "id_periodo": 3, "id_estudiante": 7, "fecha_registro": "2026-09-08T21:47:43.436218", "registrado_por": 2, "id_calificacion": 168, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.436218
206	calificaciones	INSERT	169	app_uteq	\N	\N	{"valor": 6.00, "id_materia": 1, "id_periodo": 3, "id_estudiante": 7, "fecha_registro": "2026-09-08T21:47:43.436218", "registrado_por": 2, "id_calificacion": 169, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.436218
207	calificaciones	INSERT	170	app_uteq	\N	\N	{"valor": 6.50, "id_materia": 1, "id_periodo": 3, "id_estudiante": 7, "fecha_registro": "2026-09-08T21:47:43.436218", "registrado_por": 2, "id_calificacion": 170, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.436218
208	calificaciones	INSERT	171	app_uteq	\N	\N	{"valor": 6.80, "id_materia": 2, "id_periodo": 3, "id_estudiante": 7, "fecha_registro": "2026-09-08T21:47:43.436987", "registrado_por": 3, "id_calificacion": 171, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.436987
209	calificaciones	INSERT	172	app_uteq	\N	\N	{"valor": 7.00, "id_materia": 2, "id_periodo": 3, "id_estudiante": 7, "fecha_registro": "2026-09-08T21:47:43.436987", "registrado_por": 3, "id_calificacion": 172, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.436987
210	calificaciones	INSERT	173	app_uteq	\N	\N	{"valor": 7.50, "id_materia": 2, "id_periodo": 3, "id_estudiante": 7, "fecha_registro": "2026-09-08T21:47:43.436987", "registrado_por": 3, "id_calificacion": 173, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.436987
211	calificaciones	INSERT	174	app_uteq	\N	\N	{"valor": 8.20, "id_materia": 1, "id_periodo": 3, "id_estudiante": 8, "fecha_registro": "2026-09-08T21:47:43.437894", "registrado_por": 2, "id_calificacion": 174, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.437894
212	calificaciones	INSERT	175	app_uteq	\N	\N	{"valor": 8.50, "id_materia": 1, "id_periodo": 3, "id_estudiante": 8, "fecha_registro": "2026-09-08T21:47:43.437894", "registrado_por": 2, "id_calificacion": 175, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.437894
213	calificaciones	INSERT	176	app_uteq	\N	\N	{"valor": 8.80, "id_materia": 1, "id_periodo": 3, "id_estudiante": 8, "fecha_registro": "2026-09-08T21:47:43.437894", "registrado_por": 2, "id_calificacion": 176, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.437894
214	calificaciones	INSERT	177	app_uteq	\N	\N	{"valor": 8.50, "id_materia": 2, "id_periodo": 3, "id_estudiante": 8, "fecha_registro": "2026-09-08T21:47:43.438779", "registrado_por": 3, "id_calificacion": 177, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.438779
215	calificaciones	INSERT	178	app_uteq	\N	\N	{"valor": 8.20, "id_materia": 2, "id_periodo": 3, "id_estudiante": 8, "fecha_registro": "2026-09-08T21:47:43.438779", "registrado_por": 3, "id_calificacion": 178, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.438779
216	calificaciones	INSERT	179	app_uteq	\N	\N	{"valor": 8.70, "id_materia": 2, "id_periodo": 3, "id_estudiante": 8, "fecha_registro": "2026-09-08T21:47:43.438779", "registrado_por": 3, "id_calificacion": 179, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.438779
217	calificaciones	INSERT	180	app_uteq	\N	\N	{"valor": 7.20, "id_materia": 1, "id_periodo": 3, "id_estudiante": 9, "fecha_registro": "2026-09-08T21:47:43.439547", "registrado_por": 2, "id_calificacion": 180, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.439547
218	calificaciones	INSERT	181	app_uteq	\N	\N	{"valor": 7.50, "id_materia": 1, "id_periodo": 3, "id_estudiante": 9, "fecha_registro": "2026-09-08T21:47:43.439547", "registrado_por": 2, "id_calificacion": 181, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.439547
219	calificaciones	INSERT	182	app_uteq	\N	\N	{"valor": 7.80, "id_materia": 1, "id_periodo": 3, "id_estudiante": 9, "fecha_registro": "2026-09-08T21:47:43.439547", "registrado_por": 2, "id_calificacion": 182, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.439547
220	calificaciones	INSERT	183	app_uteq	\N	\N	{"valor": 7.80, "id_materia": 2, "id_periodo": 3, "id_estudiante": 9, "fecha_registro": "2026-09-08T21:47:43.440215", "registrado_por": 3, "id_calificacion": 183, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.440215
221	calificaciones	INSERT	184	app_uteq	\N	\N	{"valor": 8.00, "id_materia": 2, "id_periodo": 3, "id_estudiante": 9, "fecha_registro": "2026-09-08T21:47:43.440215", "registrado_por": 3, "id_calificacion": 184, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.440215
222	calificaciones	INSERT	185	app_uteq	\N	\N	{"valor": 8.20, "id_materia": 2, "id_periodo": 3, "id_estudiante": 9, "fecha_registro": "2026-09-08T21:47:43.440215", "registrado_por": 3, "id_calificacion": 185, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.440215
223	calificaciones	INSERT	186	app_uteq	\N	\N	{"valor": 8.00, "id_materia": 1, "id_periodo": 3, "id_estudiante": 10, "fecha_registro": "2026-09-08T21:47:43.440882", "registrado_por": 2, "id_calificacion": 186, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.440882
224	calificaciones	INSERT	187	app_uteq	\N	\N	{"valor": 8.30, "id_materia": 1, "id_periodo": 3, "id_estudiante": 10, "fecha_registro": "2026-09-08T21:47:43.440882", "registrado_por": 2, "id_calificacion": 187, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.440882
225	calificaciones	INSERT	188	app_uteq	\N	\N	{"valor": 8.50, "id_materia": 1, "id_periodo": 3, "id_estudiante": 10, "fecha_registro": "2026-09-08T21:47:43.440882", "registrado_por": 2, "id_calificacion": 188, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.440882
226	calificaciones	INSERT	189	app_uteq	\N	\N	{"valor": 8.20, "id_materia": 2, "id_periodo": 3, "id_estudiante": 10, "fecha_registro": "2026-09-08T21:47:43.44163", "registrado_por": 3, "id_calificacion": 189, "id_tipo_evaluacion": 1}	2026-09-08 21:47:43.44163
227	calificaciones	INSERT	190	app_uteq	\N	\N	{"valor": 8.50, "id_materia": 2, "id_periodo": 3, "id_estudiante": 10, "fecha_registro": "2026-09-08T21:47:43.44163", "registrado_por": 3, "id_calificacion": 190, "id_tipo_evaluacion": 2}	2026-09-08 21:47:43.44163
228	calificaciones	INSERT	191	app_uteq	\N	\N	{"valor": 8.00, "id_materia": 2, "id_periodo": 3, "id_estudiante": 10, "fecha_registro": "2026-09-08T21:47:43.44163", "registrado_por": 3, "id_calificacion": 191, "id_tipo_evaluacion": 3}	2026-09-08 21:47:43.44163
229	materias	UPDATE	1	app_uteq	1	{"nombre": "Matematicas", "id_materia": 1, "descripcion": "Algebra y geometria basica"}	{"nombre": "Matematicas", "id_materia": 1, "descripcion": "Algebra y geometria basica test"}	2026-09-09 00:10:16.213935
230	materias	UPDATE	1	app_uteq	1	{"nombre": "Matematicas", "id_materia": 1, "descripcion": "Algebra y geometria basica test"}	{"nombre": "Matematicas", "id_materia": 1, "descripcion": "Algebra y geometria basica"}	2026-09-09 00:10:16.230652
231	materias	UPDATE	8	app_uteq	1	{"nombre": "Arte y Cultura", "id_materia": 8, "descripcion": "Expresion artistica, pintura y musica"}	{"nombre": "Arte y Cultura general", "id_materia": 8, "descripcion": "Expresion artistica, pintura y musica"}	2026-09-09 18:05:43.867506
\.


--
-- Data for Name: calificaciones; Type: TABLE DATA; Schema: colegio; Owner: -
--

COPY colegio.calificaciones (id_calificacion, id_estudiante, id_materia, id_periodo, id_tipo_evaluacion, valor, registrado_por, fecha_registro) FROM stdin;
25	1	1	1	1	8.50	2	2026-09-08 20:55:54.858213
26	1	1	1	2	9.00	2	2026-09-08 20:55:54.858213
27	1	1	1	3	7.75	2	2026-09-08 20:55:54.858213
28	2	1	1	1	6.00	2	2026-09-08 20:55:54.858213
29	2	1	1	2	7.20	2	2026-09-08 20:55:54.858213
30	2	1	1	3	6.80	2	2026-09-08 20:55:54.858213
31	1	2	1	1	9.50	3	2026-09-08 20:55:54.858213
32	1	2	1	2	8.80	3	2026-09-08 20:55:54.858213
33	1	2	1	3	9.20	3	2026-09-08 20:55:54.858213
34	3	2	1	1	8.00	3	2026-09-08 20:55:54.858213
35	3	2	1	2	7.50	3	2026-09-08 20:55:54.858213
36	2	2	1	1	7.00	3	2026-09-08 20:55:54.858213
37	2	2	1	2	7.50	3	2026-09-08 20:55:54.858213
38	2	2	1	3	8.00	3	2026-09-08 20:55:54.858213
39	1	1	2	1	9.00	2	2026-09-08 20:55:54.858213
40	1	1	2	2	8.50	2	2026-09-08 20:55:54.858213
41	2	1	2	1	7.00	2	2026-09-08 20:55:54.858213
42	3	2	2	3	8.00	1	2026-09-08 21:09:20.055172
45	3	1	2	1	8.00	1	2026-09-08 21:10:10.778141
43	3	1	2	3	4.00	1	2026-09-08 21:10:46.609303
47	4	1	1	1	7.50	2	2026-09-08 21:47:43.381682
48	4	1	1	2	8.00	2	2026-09-08 21:47:43.381682
49	4	1	1	3	7.80	2	2026-09-08 21:47:43.381682
50	4	2	1	1	8.20	3	2026-09-08 21:47:43.388322
51	4	2	1	2	7.90	3	2026-09-08 21:47:43.388322
52	4	2	1	3	8.50	3	2026-09-08 21:47:43.388322
53	5	1	1	1	5.50	2	2026-09-08 21:47:43.390044
54	5	1	1	2	6.00	2	2026-09-08 21:47:43.390044
55	5	1	1	3	6.50	2	2026-09-08 21:47:43.390044
56	5	2	1	1	6.80	3	2026-09-08 21:47:43.390916
57	5	2	1	2	7.00	3	2026-09-08 21:47:43.390916
58	5	2	1	3	7.20	3	2026-09-08 21:47:43.390916
59	6	1	1	1	9.00	2	2026-09-08 21:47:43.391911
60	6	1	1	2	9.50	2	2026-09-08 21:47:43.391911
61	6	1	1	3	9.20	2	2026-09-08 21:47:43.391911
62	6	2	1	1	8.80	3	2026-09-08 21:47:43.392797
63	6	2	1	2	9.10	3	2026-09-08 21:47:43.392797
64	6	2	1	3	8.70	3	2026-09-08 21:47:43.392797
65	7	1	1	1	4.50	2	2026-09-08 21:47:43.393636
66	7	1	1	2	5.00	2	2026-09-08 21:47:43.393636
67	7	1	1	3	5.50	2	2026-09-08 21:47:43.393636
68	7	2	1	1	6.00	3	2026-09-08 21:47:43.394767
69	7	2	1	2	6.50	3	2026-09-08 21:47:43.394767
70	7	2	1	3	7.00	3	2026-09-08 21:47:43.394767
71	8	1	1	1	7.80	2	2026-09-08 21:47:43.395478
72	8	1	1	2	8.20	2	2026-09-08 21:47:43.395478
73	8	1	1	3	8.00	2	2026-09-08 21:47:43.395478
74	8	2	1	1	8.50	3	2026-09-08 21:47:43.396374
75	8	2	1	2	8.00	3	2026-09-08 21:47:43.396374
76	8	2	1	3	8.30	3	2026-09-08 21:47:43.396374
77	9	1	1	1	6.50	2	2026-09-08 21:47:43.397683
78	9	1	1	2	7.00	2	2026-09-08 21:47:43.397683
79	9	1	1	3	7.50	2	2026-09-08 21:47:43.397683
80	9	2	1	1	7.20	3	2026-09-08 21:47:43.398998
81	9	2	1	2	7.80	3	2026-09-08 21:47:43.398998
82	9	2	1	3	7.50	3	2026-09-08 21:47:43.398998
83	10	1	1	1	8.00	2	2026-09-08 21:47:43.399909
84	10	1	1	2	7.50	2	2026-09-08 21:47:43.399909
85	10	1	1	3	8.20	2	2026-09-08 21:47:43.399909
86	10	2	1	1	7.80	3	2026-09-08 21:47:43.400804
87	10	2	1	2	8.00	3	2026-09-08 21:47:43.400804
88	10	2	1	3	8.50	3	2026-09-08 21:47:43.400804
89	4	1	2	1	8.00	2	2026-09-08 21:47:43.40209
90	4	1	2	2	8.50	2	2026-09-08 21:47:43.40209
91	4	1	2	3	8.20	2	2026-09-08 21:47:43.40209
92	4	2	2	1	7.50	3	2026-09-08 21:47:43.402795
93	4	2	2	2	8.00	3	2026-09-08 21:47:43.402795
94	4	2	2	3	7.80	3	2026-09-08 21:47:43.402795
95	5	1	2	1	6.00	2	2026-09-08 21:47:43.40368
96	5	1	2	2	6.50	2	2026-09-08 21:47:43.40368
97	5	1	2	3	7.00	2	2026-09-08 21:47:43.40368
98	5	2	2	1	7.00	3	2026-09-08 21:47:43.404667
99	5	2	2	2	7.50	3	2026-09-08 21:47:43.404667
100	5	2	2	3	7.20	3	2026-09-08 21:47:43.404667
101	6	1	2	1	9.20	2	2026-09-08 21:47:43.405439
102	6	1	2	2	9.00	2	2026-09-08 21:47:43.405439
103	6	1	2	3	9.50	2	2026-09-08 21:47:43.405439
104	6	2	2	1	9.00	3	2026-09-08 21:47:43.406211
105	6	2	2	2	9.30	3	2026-09-08 21:47:43.406211
106	6	2	2	3	9.10	3	2026-09-08 21:47:43.406211
107	7	1	2	1	5.00	2	2026-09-08 21:47:43.409667
108	7	1	2	2	5.50	2	2026-09-08 21:47:43.409667
109	7	1	2	3	6.00	2	2026-09-08 21:47:43.409667
110	7	2	2	1	6.50	3	2026-09-08 21:47:43.410554
111	7	2	2	2	7.00	3	2026-09-08 21:47:43.410554
112	7	2	2	3	7.20	3	2026-09-08 21:47:43.410554
113	8	1	2	1	8.00	2	2026-09-08 21:47:43.41125
114	8	1	2	2	8.30	2	2026-09-08 21:47:43.41125
115	8	1	2	3	8.50	2	2026-09-08 21:47:43.41125
116	8	2	2	1	8.20	3	2026-09-08 21:47:43.412157
117	8	2	2	2	8.00	3	2026-09-08 21:47:43.412157
118	8	2	2	3	8.50	3	2026-09-08 21:47:43.412157
119	9	1	2	1	7.00	2	2026-09-08 21:47:43.413058
120	9	1	2	2	7.50	2	2026-09-08 21:47:43.413058
121	9	1	2	3	7.20	2	2026-09-08 21:47:43.413058
122	9	2	2	1	7.50	3	2026-09-08 21:47:43.416394
123	9	2	2	2	8.00	3	2026-09-08 21:47:43.416394
124	9	2	2	3	7.80	3	2026-09-08 21:47:43.416394
125	10	1	2	1	7.80	2	2026-09-08 21:47:43.417659
126	10	1	2	2	8.00	2	2026-09-08 21:47:43.417659
127	10	1	2	3	8.30	2	2026-09-08 21:47:43.417659
128	10	2	2	1	8.00	3	2026-09-08 21:47:43.419792
129	10	2	2	2	8.50	3	2026-09-08 21:47:43.419792
130	10	2	2	3	8.20	3	2026-09-08 21:47:43.419792
132	1	1	3	1	8.80	2	2026-09-08 21:47:43.422619
133	1	1	3	2	9.20	2	2026-09-08 21:47:43.422619
134	1	1	3	3	9.00	2	2026-09-08 21:47:43.422619
135	1	2	3	1	9.00	3	2026-09-08 21:47:43.423585
136	1	2	3	2	9.50	3	2026-09-08 21:47:43.423585
137	1	2	3	3	9.30	3	2026-09-08 21:47:43.423585
138	2	1	3	1	7.00	2	2026-09-08 21:47:43.424381
139	2	1	3	2	7.50	2	2026-09-08 21:47:43.424381
140	2	1	3	3	7.20	2	2026-09-08 21:47:43.424381
141	2	2	3	1	7.50	3	2026-09-08 21:47:43.425166
142	2	2	3	2	8.00	3	2026-09-08 21:47:43.425166
143	2	2	3	3	7.80	3	2026-09-08 21:47:43.425166
144	3	1	3	1	8.50	2	2026-09-08 21:47:43.426002
145	3	1	3	2	8.80	2	2026-09-08 21:47:43.426002
146	3	1	3	3	9.00	2	2026-09-08 21:47:43.426002
147	3	2	3	1	8.80	3	2026-09-08 21:47:43.426673
148	3	2	3	2	9.00	3	2026-09-08 21:47:43.426673
149	3	2	3	3	8.50	3	2026-09-08 21:47:43.426673
150	4	1	3	1	8.00	2	2026-09-08 21:47:43.428621
151	4	1	3	2	8.50	2	2026-09-08 21:47:43.428621
152	4	1	3	3	8.30	2	2026-09-08 21:47:43.428621
153	4	2	3	1	8.50	3	2026-09-08 21:47:43.430648
154	4	2	3	2	8.00	3	2026-09-08 21:47:43.430648
155	4	2	3	3	8.80	3	2026-09-08 21:47:43.430648
156	5	1	3	1	6.50	2	2026-09-08 21:47:43.431677
157	5	1	3	2	7.00	2	2026-09-08 21:47:43.431677
158	5	1	3	3	7.50	2	2026-09-08 21:47:43.431677
159	5	2	3	1	7.20	3	2026-09-08 21:47:43.432771
160	5	2	3	2	7.50	3	2026-09-08 21:47:43.432771
161	5	2	3	3	7.80	3	2026-09-08 21:47:43.432771
162	6	1	3	1	9.00	2	2026-09-08 21:47:43.433758
163	6	1	3	2	9.30	2	2026-09-08 21:47:43.433758
164	6	1	3	3	9.50	2	2026-09-08 21:47:43.433758
165	6	2	3	1	9.20	3	2026-09-08 21:47:43.434777
166	6	2	3	2	9.00	3	2026-09-08 21:47:43.434777
167	6	2	3	3	9.40	3	2026-09-08 21:47:43.434777
168	7	1	3	1	5.50	2	2026-09-08 21:47:43.436218
169	7	1	3	2	6.00	2	2026-09-08 21:47:43.436218
170	7	1	3	3	6.50	2	2026-09-08 21:47:43.436218
171	7	2	3	1	6.80	3	2026-09-08 21:47:43.436987
172	7	2	3	2	7.00	3	2026-09-08 21:47:43.436987
173	7	2	3	3	7.50	3	2026-09-08 21:47:43.436987
174	8	1	3	1	8.20	2	2026-09-08 21:47:43.437894
175	8	1	3	2	8.50	2	2026-09-08 21:47:43.437894
176	8	1	3	3	8.80	2	2026-09-08 21:47:43.437894
177	8	2	3	1	8.50	3	2026-09-08 21:47:43.438779
178	8	2	3	2	8.20	3	2026-09-08 21:47:43.438779
179	8	2	3	3	8.70	3	2026-09-08 21:47:43.438779
180	9	1	3	1	7.20	2	2026-09-08 21:47:43.439547
181	9	1	3	2	7.50	2	2026-09-08 21:47:43.439547
182	9	1	3	3	7.80	2	2026-09-08 21:47:43.439547
183	9	2	3	1	7.80	3	2026-09-08 21:47:43.440215
184	9	2	3	2	8.00	3	2026-09-08 21:47:43.440215
185	9	2	3	3	8.20	3	2026-09-08 21:47:43.440215
186	10	1	3	1	8.00	2	2026-09-08 21:47:43.440882
187	10	1	3	2	8.30	2	2026-09-08 21:47:43.440882
188	10	1	3	3	8.50	2	2026-09-08 21:47:43.440882
189	10	2	3	1	8.20	3	2026-09-08 21:47:43.44163
190	10	2	3	2	8.50	3	2026-09-08 21:47:43.44163
191	10	2	3	3	8.00	3	2026-09-08 21:47:43.44163
\.


--
-- Data for Name: estudiantes; Type: TABLE DATA; Schema: colegio; Owner: -
--

COPY colegio.estudiantes (id_estudiante, cedula, nombres, apellidos, fecha_nacimiento, id_representante, id_usuario, activo) FROM stdin;
1	1250001111	Ana	Garcia	2010-03-15	1	\N	t
2	1250002222	Pedro	Lopez	2010-07-22	2	\N	t
3	1250003333	Sofia	Garcia	2011-01-09	1	\N	t
4	1250004444	Valentina	Morales	2010-05-20	3	\N	t
5	1250005555	Sebastian	Fernandez	2010-11-14	4	\N	t
6	1250006666	Camila	Diaz	2009-08-03	5	\N	t
7	1250007777	Mateo	Ruiz	2010-02-28	6	\N	t
8	1250008888	Isabella	Castillo	2010-06-17	7	\N	t
9	1250009999	Daniel	Garcia	2010-09-25	1	\N	t
10	1250010000	Maria	Lopez	2010-12-10	2	\N	t
\.


--
-- Data for Name: materias; Type: TABLE DATA; Schema: colegio; Owner: -
--

COPY colegio.materias (id_materia, nombre, descripcion) FROM stdin;
2	Lengua y Literatura	Comprension lectora y escritura
3	Historia	Reforzar el conocimiento del estudiante ante los sucesos historicos del mundo
4	Ciencias Naturales	Biologia, quimica y fisica aplicada
5	Estudios Sociales	Historia, geografia y ciudadania
7	Educacion Fisica	Deportes, salud y condicion fisica
6	Ingles	Gramatica, conversacion y comprension auditiva de gran nivel
1	Matematicas	Algebra y geometria basica
8	Arte y Cultura general	Expresion artistica, pintura y musica
\.


--
-- Data for Name: matriculas; Type: TABLE DATA; Schema: colegio; Owner: -
--

COPY colegio.matriculas (id_matricula, id_estudiante, id_periodo) FROM stdin;
10	1	1
11	2	1
12	3	1
13	1	2
14	2	2
15	3	2
16	1	3
17	2	3
18	3	3
19	4	1
20	4	2
21	4	3
22	5	1
23	5	2
24	5	3
25	6	1
26	6	2
27	6	3
28	7	1
29	7	2
30	7	3
31	8	1
32	8	2
33	8	3
34	9	1
35	9	2
36	9	3
37	10	1
38	10	2
39	10	3
\.


--
-- Data for Name: periodos_academicos; Type: TABLE DATA; Schema: colegio; Owner: -
--

COPY colegio.periodos_academicos (id_periodo, nombre, fecha_inicio, fecha_fin, activo) FROM stdin;
1	Primer Quimestre 2026-2027	2026-09-01	2026-09-07	t
3	Tercer Quimestre 2026-2027	2026-09-08	2027-03-08	t
2	Segundo Quimestre 2026-2027	2026-10-08	2027-06-30	t
\.


--
-- Data for Name: profesor_materia_periodo; Type: TABLE DATA; Schema: colegio; Owner: -
--

COPY colegio.profesor_materia_periodo (id_asignacion, id_profesor, id_materia, id_periodo) FROM stdin;
7	1	1	1
8	2	2	1
9	1	1	2
10	2	2	2
11	2	3	3
12	1	1	3
13	2	2	3
14	3	4	3
15	4	5	3
17	1	7	3
18	2	8	3
16	5	6	3
\.


--
-- Data for Name: profesores; Type: TABLE DATA; Schema: colegio; Owner: -
--

COPY colegio.profesores (id_profesor, cedula, nombres, apellidos, especialidad, id_usuario, activo) FROM stdin;
1	1204567890	Carla	Vera	Matematicas	2	t
2	1209876543	Jorge	Mendoza	Lengua y Literatura	3	t
3	1211223344	Elena	Romero	Ciencias Naturales	4	t
4	1255667788	Andres	Torres	Estudios Sociales	5	t
5	1299887766	Diana	Vargas	Ingles	6	t
\.


--
-- Data for Name: representantes; Type: TABLE DATA; Schema: colegio; Owner: -
--

COPY colegio.representantes (id_representante, nombres, apellidos, telefono, email) FROM stdin;
1	Luis	Garcia	0991234567	luis.garcia@gmail.com
2	Maria	Lopez	0987654321	maria.lopez@gmail.com
3	Carlos	Morales	0991112233	carlos.morales@gmail.com
4	Lucia	Fernandez	0984445566	lucia.fernandez@gmail.com
5	Roberto	Diaz	0977778899	roberto.diaz@gmail.com
6	Patricia	Ruiz	0963334455	patricia.ruiz@gmail.com
7	Fernando	Castillo	0956667788	fernando.castillo@gmail.com
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: colegio; Owner: -
--

COPY colegio.roles (id_rol, nombre_rol) FROM stdin;
1	administrador
2	profesor
3	representante
\.


--
-- Data for Name: sesiones; Type: TABLE DATA; Schema: colegio; Owner: -
--

COPY colegio.sesiones (sid, sess, expire) FROM stdin;
s0GD8AYGt8LuDvq4T3NEf6Ew7ytBQGWs	{"cookie":{"originalMaxAge":14400000,"expires":"2026-09-09T08:25:21.994Z","httpOnly":true,"path":"/","sameSite":"lax"},"usuario":{"id_usuario":1,"nombres":"Moises","apellidos":"Panama","email":"admin@uteq.edu.ec","nombre_rol":"administrador"}}	2026-09-09 03:25:23
BHPBieG5irtJW27o0DnSFWPclPT9lJCD	{"cookie":{"originalMaxAge":14400000,"expires":"2026-09-09T07:38:32.838Z","httpOnly":true,"path":"/"},"usuario":{"id_usuario":1,"nombres":"Moises","apellidos":"Panama","email":"admin@uteq.edu.ec","nombre_rol":"administrador"}}	2026-09-09 02:38:34
iKEnitUlo3yuS2zx2yP346jQY4ILLIzm	{"cookie":{"originalMaxAge":14400000,"expires":"2026-09-09T08:28:00.016Z","httpOnly":true,"path":"/","sameSite":"lax"},"usuario":{"id_usuario":1,"nombres":"Moises","apellidos":"Panama","email":"admin@uteq.edu.ec","nombre_rol":"administrador"}}	2026-09-09 03:28:01
9ZBfNp0agkLnqUkAoaFS0VYrpexbygTJ	{"cookie":{"originalMaxAge":14400000,"expires":"2026-09-09T08:28:50.626Z","httpOnly":true,"path":"/","sameSite":"lax"},"usuario":{"id_usuario":1,"nombres":"Moises","apellidos":"Panama","email":"admin@uteq.edu.ec","nombre_rol":"administrador"}}	2026-09-09 03:28:51
vU-AmjXq_tGUjMkJ-4oisJ_qqx1L0NQR	{"cookie":{"originalMaxAge":14400000,"expires":"2026-09-09T08:25:37.163Z","httpOnly":true,"path":"/","sameSite":"lax"},"usuario":{"id_usuario":1,"nombres":"Moises","apellidos":"Panama","email":"admin@uteq.edu.ec","nombre_rol":"administrador"}}	2026-09-09 03:25:38
CI5wv4dcF3zfmhhF2xFWkjA9Qy45g_In	{"cookie":{"originalMaxAge":14400000,"expires":"2026-09-09T08:25:43.423Z","httpOnly":true,"path":"/","sameSite":"lax"},"usuario":{"id_usuario":1,"nombres":"Moises","apellidos":"Panama","email":"admin@uteq.edu.ec","nombre_rol":"administrador"}}	2026-09-09 03:25:44
rc3UxwzHDCCAhLQkJIw2jkd6J4Mt8NqS	{"cookie":{"originalMaxAge":14400000,"expires":"2026-09-09T08:28:40.983Z","httpOnly":true,"path":"/","sameSite":"lax"},"usuario":{"id_usuario":1,"nombres":"Moises","apellidos":"Panama","email":"admin@uteq.edu.ec","nombre_rol":"administrador"},"periodoSeleccionado":3}	2026-09-09 03:28:41
F0LwvknFCFUQWB6APWu85bDLBHnFmsU1	{"cookie":{"originalMaxAge":14400000,"expires":"2026-09-09T08:26:47.183Z","httpOnly":true,"path":"/","sameSite":"lax"},"usuario":{"id_usuario":1,"nombres":"Moises","apellidos":"Panama","email":"admin@uteq.edu.ec","nombre_rol":"administrador"}}	2026-09-09 03:26:48
pcbn0lxTc0Z9b4epIvl03SGrysjCEOqh	{"cookie":{"originalMaxAge":14400000,"expires":"2026-09-09T07:38:44.416Z","httpOnly":true,"path":"/"},"usuario":{"id_usuario":1,"nombres":"Moises","apellidos":"Panama","email":"admin@uteq.edu.ec","nombre_rol":"administrador"}}	2026-09-09 02:38:45
Nrz8PF2wRPotdJr4fffTZ9li_4QPmVhp	{"cookie":{"originalMaxAge":14400000,"expires":"2026-09-10T03:02:26.870Z","httpOnly":true,"path":"/","sameSite":"lax"},"usuario":{"id_usuario":1,"nombres":"Moises","apellidos":"Panama","email":"admin@uteq.edu.ec","nombre_rol":"administrador"}}	2026-09-09 22:10:53
Ty7bLfaa2MI8OqTK2LCOquXvQfY3_IKc	{"cookie":{"originalMaxAge":14400000,"expires":"2026-09-09T07:30:29.359Z","httpOnly":true,"path":"/"},"usuario":{"id_usuario":1,"nombres":"Moises","apellidos":"Panama","email":"admin@uteq.edu.ec","nombre_rol":"administrador"}}	2026-09-09 02:30:30
0Ui4BlaIH064XqNi1JGuWGNJ700YddwZ	{"cookie":{"originalMaxAge":14400000,"expires":"2026-09-09T07:32:54.718Z","httpOnly":true,"path":"/"},"usuario":{"id_usuario":1,"nombres":"Moises","apellidos":"Panama","email":"admin@uteq.edu.ec","nombre_rol":"administrador"}}	2026-09-09 02:32:55
RVHvhVsud7C9OU8UMcuv2o81L28UGMni	{"cookie":{"originalMaxAge":14400000,"expires":"2026-09-09T07:34:16.772Z","httpOnly":true,"path":"/"},"usuario":{"id_usuario":1,"nombres":"Moises","apellidos":"Panama","email":"admin@uteq.edu.ec","nombre_rol":"administrador"}}	2026-09-09 02:34:17
6RQ-Exu6rAQdzvbqcphL0CcPYhAMa5VL	{"cookie":{"originalMaxAge":14400000,"expires":"2026-09-09T08:37:35.011Z","httpOnly":true,"path":"/","sameSite":"lax"},"usuario":{"id_usuario":1,"nombres":"Moises","apellidos":"Panama","email":"admin@uteq.edu.ec","nombre_rol":"administrador"},"periodoSeleccionado":3}	2026-09-09 03:37:36
pyyBRdWUriiPg3M4nWqWwnsog9peJ3Mn	{"cookie":{"originalMaxAge":14400000,"expires":"2026-09-09T09:52:52.412Z","httpOnly":true,"path":"/","sameSite":"lax"},"usuario":{"id_usuario":1,"nombres":"Moises","apellidos":"Panama","email":"admin@uteq.edu.ec","nombre_rol":"administrador"}}	2026-09-09 04:52:53
\.


--
-- Data for Name: tipos_evaluacion; Type: TABLE DATA; Schema: colegio; Owner: -
--

COPY colegio.tipos_evaluacion (id_tipo_evaluacion, nombre, peso) FROM stdin;
1	Parcial 1	0.30
2	Parcial 2	0.30
3	Parcial 3	0.40
\.


--
-- Data for Name: usuarios; Type: TABLE DATA; Schema: colegio; Owner: -
--

COPY colegio.usuarios (id_usuario, nombres, apellidos, email, password_hash, id_rol, activo) FROM stdin;
1	Moises	Panama	admin@uteq.edu.ec	$2b$10$.9rk4MxOlDi6Jf5KhOrPCOKe77.D.Eytt3uThBTnSCWdsal8U24A.	1	t
2	Carla	Vera	carla.vera@uteq.edu.ec	$2b$10$5ZplphSVBSZonbr8i0ctR.BKbVakXpW0NfLt.PKzHppqTX.SSK6PG	2	t
3	Jorge	Mendoza	jorge.mendoza@uteq.edu.ec	$2b$10$5ZplphSVBSZonbr8i0ctR.BKbVakXpW0NfLt.PKzHppqTX.SSK6PG	2	t
4	Elena	Romero	elena.romero@uteq.edu.ec	$2b$10$5ZplphSVBSZonbr8i0ctR.BKbVakXpW0NfLt.PKzHppqTX.SSK6PG	2	t
5	Andres	Torres	andres.torres@uteq.edu.ec	$2b$10$5ZplphSVBSZonbr8i0ctR.BKbVakXpW0NfLt.PKzHppqTX.SSK6PG	2	t
6	Diana	Vargas	diana.vargas@uteq.edu.ec	$2b$10$5ZplphSVBSZonbr8i0ctR.BKbVakXpW0NfLt.PKzHppqTX.SSK6PG	2	t
\.


--
-- Name: auditoria_id_auditoria_seq; Type: SEQUENCE SET; Schema: colegio; Owner: -
--

SELECT pg_catalog.setval('colegio.auditoria_id_auditoria_seq', 231, true);


--
-- Name: calificaciones_id_calificacion_seq; Type: SEQUENCE SET; Schema: colegio; Owner: -
--

SELECT pg_catalog.setval('colegio.calificaciones_id_calificacion_seq', 191, true);


--
-- Name: estudiantes_id_estudiante_seq; Type: SEQUENCE SET; Schema: colegio; Owner: -
--

SELECT pg_catalog.setval('colegio.estudiantes_id_estudiante_seq', 10, true);


--
-- Name: materias_id_materia_seq; Type: SEQUENCE SET; Schema: colegio; Owner: -
--

SELECT pg_catalog.setval('colegio.materias_id_materia_seq', 8, true);


--
-- Name: matriculas_id_matricula_seq; Type: SEQUENCE SET; Schema: colegio; Owner: -
--

SELECT pg_catalog.setval('colegio.matriculas_id_matricula_seq', 39, true);


--
-- Name: periodos_academicos_id_periodo_seq; Type: SEQUENCE SET; Schema: colegio; Owner: -
--

SELECT pg_catalog.setval('colegio.periodos_academicos_id_periodo_seq', 3, true);


--
-- Name: profesor_materia_periodo_id_asignacion_seq; Type: SEQUENCE SET; Schema: colegio; Owner: -
--

SELECT pg_catalog.setval('colegio.profesor_materia_periodo_id_asignacion_seq', 18, true);


--
-- Name: profesores_id_profesor_seq; Type: SEQUENCE SET; Schema: colegio; Owner: -
--

SELECT pg_catalog.setval('colegio.profesores_id_profesor_seq', 5, true);


--
-- Name: representantes_id_representante_seq; Type: SEQUENCE SET; Schema: colegio; Owner: -
--

SELECT pg_catalog.setval('colegio.representantes_id_representante_seq', 7, true);


--
-- Name: roles_id_rol_seq; Type: SEQUENCE SET; Schema: colegio; Owner: -
--

SELECT pg_catalog.setval('colegio.roles_id_rol_seq', 3, true);


--
-- Name: tipos_evaluacion_id_tipo_evaluacion_seq; Type: SEQUENCE SET; Schema: colegio; Owner: -
--

SELECT pg_catalog.setval('colegio.tipos_evaluacion_id_tipo_evaluacion_seq', 3, true);


--
-- Name: usuarios_id_usuario_seq; Type: SEQUENCE SET; Schema: colegio; Owner: -
--

SELECT pg_catalog.setval('colegio.usuarios_id_usuario_seq', 6, true);


--
-- Name: auditoria auditoria_pkey; Type: CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.auditoria
    ADD CONSTRAINT auditoria_pkey PRIMARY KEY (id_auditoria);


--
-- Name: calificaciones calificaciones_id_estudiante_id_materia_id_periodo_id_tipo__key; Type: CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.calificaciones
    ADD CONSTRAINT calificaciones_id_estudiante_id_materia_id_periodo_id_tipo__key UNIQUE (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion);


--
-- Name: calificaciones calificaciones_pkey; Type: CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.calificaciones
    ADD CONSTRAINT calificaciones_pkey PRIMARY KEY (id_calificacion);


--
-- Name: estudiantes estudiantes_cedula_key; Type: CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.estudiantes
    ADD CONSTRAINT estudiantes_cedula_key UNIQUE (cedula);


--
-- Name: estudiantes estudiantes_pkey; Type: CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.estudiantes
    ADD CONSTRAINT estudiantes_pkey PRIMARY KEY (id_estudiante);


--
-- Name: materias materias_nombre_key; Type: CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.materias
    ADD CONSTRAINT materias_nombre_key UNIQUE (nombre);


--
-- Name: materias materias_pkey; Type: CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.materias
    ADD CONSTRAINT materias_pkey PRIMARY KEY (id_materia);


--
-- Name: matriculas matriculas_id_estudiante_id_periodo_key; Type: CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.matriculas
    ADD CONSTRAINT matriculas_id_estudiante_id_periodo_key UNIQUE (id_estudiante, id_periodo);


--
-- Name: matriculas matriculas_pkey; Type: CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.matriculas
    ADD CONSTRAINT matriculas_pkey PRIMARY KEY (id_matricula);


--
-- Name: periodos_academicos periodos_academicos_nombre_key; Type: CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.periodos_academicos
    ADD CONSTRAINT periodos_academicos_nombre_key UNIQUE (nombre);


--
-- Name: periodos_academicos periodos_academicos_pkey; Type: CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.periodos_academicos
    ADD CONSTRAINT periodos_academicos_pkey PRIMARY KEY (id_periodo);


--
-- Name: profesor_materia_periodo profesor_materia_periodo_id_profesor_id_materia_id_periodo_key; Type: CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.profesor_materia_periodo
    ADD CONSTRAINT profesor_materia_periodo_id_profesor_id_materia_id_periodo_key UNIQUE (id_profesor, id_materia, id_periodo);


--
-- Name: profesor_materia_periodo profesor_materia_periodo_pkey; Type: CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.profesor_materia_periodo
    ADD CONSTRAINT profesor_materia_periodo_pkey PRIMARY KEY (id_asignacion);


--
-- Name: profesores profesores_cedula_key; Type: CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.profesores
    ADD CONSTRAINT profesores_cedula_key UNIQUE (cedula);


--
-- Name: profesores profesores_pkey; Type: CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.profesores
    ADD CONSTRAINT profesores_pkey PRIMARY KEY (id_profesor);


--
-- Name: representantes representantes_pkey; Type: CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.representantes
    ADD CONSTRAINT representantes_pkey PRIMARY KEY (id_representante);


--
-- Name: roles roles_nombre_rol_key; Type: CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.roles
    ADD CONSTRAINT roles_nombre_rol_key UNIQUE (nombre_rol);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id_rol);


--
-- Name: sesiones sesiones_pkey; Type: CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.sesiones
    ADD CONSTRAINT sesiones_pkey PRIMARY KEY (sid);


--
-- Name: tipos_evaluacion tipos_evaluacion_nombre_key; Type: CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.tipos_evaluacion
    ADD CONSTRAINT tipos_evaluacion_nombre_key UNIQUE (nombre);


--
-- Name: tipos_evaluacion tipos_evaluacion_pkey; Type: CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.tipos_evaluacion
    ADD CONSTRAINT tipos_evaluacion_pkey PRIMARY KEY (id_tipo_evaluacion);


--
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id_usuario);


--
-- Name: idx_sesiones_expire; Type: INDEX; Schema: colegio; Owner: -
--

CREATE INDEX idx_sesiones_expire ON colegio.sesiones USING btree (expire);


--
-- Name: calificaciones trg_auditoria_calificaciones; Type: TRIGGER; Schema: colegio; Owner: -
--

CREATE TRIGGER trg_auditoria_calificaciones AFTER INSERT OR DELETE OR UPDATE ON colegio.calificaciones FOR EACH ROW EXECUTE FUNCTION colegio.fn_auditoria_generica('id_calificacion');


--
-- Name: estudiantes trg_auditoria_estudiantes; Type: TRIGGER; Schema: colegio; Owner: -
--

CREATE TRIGGER trg_auditoria_estudiantes AFTER INSERT OR DELETE OR UPDATE ON colegio.estudiantes FOR EACH ROW EXECUTE FUNCTION colegio.fn_auditoria_generica('id_estudiante');


--
-- Name: materias trg_auditoria_materias; Type: TRIGGER; Schema: colegio; Owner: -
--

CREATE TRIGGER trg_auditoria_materias AFTER INSERT OR DELETE OR UPDATE ON colegio.materias FOR EACH ROW EXECUTE FUNCTION colegio.fn_auditoria_generica('id_materia');


--
-- Name: matriculas trg_auditoria_matriculas; Type: TRIGGER; Schema: colegio; Owner: -
--

CREATE TRIGGER trg_auditoria_matriculas AFTER INSERT OR DELETE OR UPDATE ON colegio.matriculas FOR EACH ROW EXECUTE FUNCTION colegio.fn_auditoria_generica('id_matricula');


--
-- Name: periodos_academicos trg_auditoria_periodos; Type: TRIGGER; Schema: colegio; Owner: -
--

CREATE TRIGGER trg_auditoria_periodos AFTER INSERT OR DELETE OR UPDATE ON colegio.periodos_academicos FOR EACH ROW EXECUTE FUNCTION colegio.fn_auditoria_generica('id_periodo');


--
-- Name: profesor_materia_periodo trg_auditoria_profesor_materia_periodo; Type: TRIGGER; Schema: colegio; Owner: -
--

CREATE TRIGGER trg_auditoria_profesor_materia_periodo AFTER INSERT OR DELETE OR UPDATE ON colegio.profesor_materia_periodo FOR EACH ROW EXECUTE FUNCTION colegio.fn_auditoria_generica('id_asignacion');


--
-- Name: profesores trg_auditoria_profesores; Type: TRIGGER; Schema: colegio; Owner: -
--

CREATE TRIGGER trg_auditoria_profesores AFTER INSERT OR DELETE OR UPDATE ON colegio.profesores FOR EACH ROW EXECUTE FUNCTION colegio.fn_auditoria_generica('id_profesor');


--
-- Name: tipos_evaluacion trg_auditoria_tipos_evaluacion; Type: TRIGGER; Schema: colegio; Owner: -
--

CREATE TRIGGER trg_auditoria_tipos_evaluacion AFTER INSERT OR DELETE OR UPDATE ON colegio.tipos_evaluacion FOR EACH ROW EXECUTE FUNCTION colegio.fn_auditoria_generica('id_tipo_evaluacion');


--
-- Name: usuarios trg_auditoria_usuarios; Type: TRIGGER; Schema: colegio; Owner: -
--

CREATE TRIGGER trg_auditoria_usuarios AFTER INSERT OR DELETE OR UPDATE ON colegio.usuarios FOR EACH ROW EXECUTE FUNCTION colegio.fn_auditoria_generica('id_usuario');


--
-- Name: calificaciones trg_validar_calificacion; Type: TRIGGER; Schema: colegio; Owner: -
--

CREATE TRIGGER trg_validar_calificacion BEFORE INSERT OR UPDATE ON colegio.calificaciones FOR EACH ROW EXECUTE FUNCTION colegio.fn_validar_calificacion();


--
-- Name: calificaciones calificaciones_id_estudiante_fkey; Type: FK CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.calificaciones
    ADD CONSTRAINT calificaciones_id_estudiante_fkey FOREIGN KEY (id_estudiante) REFERENCES colegio.estudiantes(id_estudiante);


--
-- Name: calificaciones calificaciones_id_materia_fkey; Type: FK CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.calificaciones
    ADD CONSTRAINT calificaciones_id_materia_fkey FOREIGN KEY (id_materia) REFERENCES colegio.materias(id_materia);


--
-- Name: calificaciones calificaciones_id_periodo_fkey; Type: FK CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.calificaciones
    ADD CONSTRAINT calificaciones_id_periodo_fkey FOREIGN KEY (id_periodo) REFERENCES colegio.periodos_academicos(id_periodo);


--
-- Name: calificaciones calificaciones_id_tipo_evaluacion_fkey; Type: FK CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.calificaciones
    ADD CONSTRAINT calificaciones_id_tipo_evaluacion_fkey FOREIGN KEY (id_tipo_evaluacion) REFERENCES colegio.tipos_evaluacion(id_tipo_evaluacion);


--
-- Name: calificaciones calificaciones_registrado_por_fkey; Type: FK CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.calificaciones
    ADD CONSTRAINT calificaciones_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES colegio.usuarios(id_usuario);


--
-- Name: estudiantes estudiantes_id_representante_fkey; Type: FK CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.estudiantes
    ADD CONSTRAINT estudiantes_id_representante_fkey FOREIGN KEY (id_representante) REFERENCES colegio.representantes(id_representante);


--
-- Name: estudiantes estudiantes_id_usuario_fkey; Type: FK CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.estudiantes
    ADD CONSTRAINT estudiantes_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES colegio.usuarios(id_usuario);


--
-- Name: matriculas matriculas_id_estudiante_fkey; Type: FK CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.matriculas
    ADD CONSTRAINT matriculas_id_estudiante_fkey FOREIGN KEY (id_estudiante) REFERENCES colegio.estudiantes(id_estudiante);


--
-- Name: matriculas matriculas_id_periodo_fkey; Type: FK CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.matriculas
    ADD CONSTRAINT matriculas_id_periodo_fkey FOREIGN KEY (id_periodo) REFERENCES colegio.periodos_academicos(id_periodo);


--
-- Name: profesor_materia_periodo profesor_materia_periodo_id_materia_fkey; Type: FK CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.profesor_materia_periodo
    ADD CONSTRAINT profesor_materia_periodo_id_materia_fkey FOREIGN KEY (id_materia) REFERENCES colegio.materias(id_materia);


--
-- Name: profesor_materia_periodo profesor_materia_periodo_id_periodo_fkey; Type: FK CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.profesor_materia_periodo
    ADD CONSTRAINT profesor_materia_periodo_id_periodo_fkey FOREIGN KEY (id_periodo) REFERENCES colegio.periodos_academicos(id_periodo);


--
-- Name: profesor_materia_periodo profesor_materia_periodo_id_profesor_fkey; Type: FK CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.profesor_materia_periodo
    ADD CONSTRAINT profesor_materia_periodo_id_profesor_fkey FOREIGN KEY (id_profesor) REFERENCES colegio.profesores(id_profesor);


--
-- Name: profesores profesores_id_usuario_fkey; Type: FK CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.profesores
    ADD CONSTRAINT profesores_id_usuario_fkey FOREIGN KEY (id_usuario) REFERENCES colegio.usuarios(id_usuario);


--
-- Name: usuarios usuarios_id_rol_fkey; Type: FK CONSTRAINT; Schema: colegio; Owner: -
--

ALTER TABLE ONLY colegio.usuarios
    ADD CONSTRAINT usuarios_id_rol_fkey FOREIGN KEY (id_rol) REFERENCES colegio.roles(id_rol);


--
-- PostgreSQL database dump complete
--

\unrestrict iFjYO32c6IkmvUznahue6y7poonZaOVAZutB192ngYWHVrx0z2cnyYbS9YZmcL2

