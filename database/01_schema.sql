-- =========================================================
-- 01_schema.sql
-- Esquema "colegio" - Sistema de Registro de Calificaciones
-- Normalizado hasta 3FN
-- =========================================================

CREATE SCHEMA IF NOT EXISTS colegio;
SET search_path TO colegio;

-- Roles del sistema (para autenticación/autorización de usuarios)
CREATE TABLE roles (
    id_rol      SERIAL PRIMARY KEY,
    nombre_rol  VARCHAR(30) NOT NULL UNIQUE
);

-- Usuarios que pueden iniciar sesión (admin, profesor, representante, etc.)
CREATE TABLE usuarios (
    id_usuario     SERIAL PRIMARY KEY,
    nombres        VARCHAR(80) NOT NULL,
    apellidos      VARCHAR(80) NOT NULL,
    email          VARCHAR(120) NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    id_rol         INTEGER NOT NULL REFERENCES roles(id_rol),
    activo         BOOLEAN NOT NULL DEFAULT TRUE
);

-- Representantes (padres/tutores) de los estudiantes
CREATE TABLE representantes (
    id_representante  SERIAL PRIMARY KEY,
    nombres           VARCHAR(80) NOT NULL,
    apellidos         VARCHAR(80) NOT NULL,
    telefono          VARCHAR(20),
    email             VARCHAR(120)
);

-- Estudiantes
CREATE TABLE estudiantes (
    id_estudiante     SERIAL PRIMARY KEY,
    cedula            VARCHAR(15) NOT NULL UNIQUE,
    nombres           VARCHAR(80) NOT NULL,
    apellidos         VARCHAR(80) NOT NULL,
    fecha_nacimiento  DATE NOT NULL,
    id_representante  INTEGER NOT NULL REFERENCES representantes(id_representante),
    id_usuario        INTEGER REFERENCES usuarios(id_usuario),
    activo            BOOLEAN NOT NULL DEFAULT TRUE
);

-- Profesores
CREATE TABLE profesores (
    id_profesor   SERIAL PRIMARY KEY,
    cedula        VARCHAR(15) NOT NULL UNIQUE,
    nombres       VARCHAR(80) NOT NULL,
    apellidos     VARCHAR(80) NOT NULL,
    especialidad  VARCHAR(80),
    id_usuario    INTEGER REFERENCES usuarios(id_usuario),
    activo        BOOLEAN NOT NULL DEFAULT TRUE
);

-- Materias (asignaturas)
CREATE TABLE materias (
    id_materia   SERIAL PRIMARY KEY,
    nombre       VARCHAR(80) NOT NULL UNIQUE,
    descripcion  TEXT
);

-- Períodos académicos (ej. "2026-2027 Primer Quimestre")
CREATE TABLE periodos_academicos (
    id_periodo     SERIAL PRIMARY KEY,
    nombre         VARCHAR(60) NOT NULL UNIQUE,
    fecha_inicio   DATE NOT NULL,
    fecha_fin      DATE NOT NULL,
    activo         BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT chk_fechas_periodo CHECK (fecha_fin > fecha_inicio)
);

-- Matrícula: qué estudiante está inscrito en qué período
CREATE TABLE matriculas (
    id_matricula   SERIAL PRIMARY KEY,
    id_estudiante  INTEGER NOT NULL REFERENCES estudiantes(id_estudiante),
    id_periodo     INTEGER NOT NULL REFERENCES periodos_academicos(id_periodo),
    UNIQUE (id_estudiante, id_periodo)
);

-- Asignación: qué profesor dicta qué materia en qué período
CREATE TABLE profesor_materia_periodo (
    id_asignacion  SERIAL PRIMARY KEY,
    id_profesor    INTEGER NOT NULL REFERENCES profesores(id_profesor),
    id_materia     INTEGER NOT NULL REFERENCES materias(id_materia),
    id_periodo     INTEGER NOT NULL REFERENCES periodos_academicos(id_periodo),
    UNIQUE (id_profesor, id_materia, id_periodo)
);

-- Tipos de evaluación (parcial 1, parcial 2, examen, etc.) con su peso
CREATE TABLE tipos_evaluacion (
    id_tipo_evaluacion  SERIAL PRIMARY KEY,
    nombre              VARCHAR(50) NOT NULL UNIQUE,
    peso                NUMERIC(3,2) NOT NULL CHECK (peso > 0 AND peso <= 1)
);

-- Calificaciones: la nota parcial que un estudiante obtiene
-- en una materia, período y tipo de evaluación específicos.
-- El promedio/nota final NUNCA se guarda aquí: se calcula con función.
CREATE TABLE calificaciones (
    id_calificacion    SERIAL PRIMARY KEY,
    id_estudiante      INTEGER NOT NULL REFERENCES estudiantes(id_estudiante),
    id_materia         INTEGER NOT NULL REFERENCES materias(id_materia),
    id_periodo         INTEGER NOT NULL REFERENCES periodos_academicos(id_periodo),
    id_tipo_evaluacion INTEGER NOT NULL REFERENCES tipos_evaluacion(id_tipo_evaluacion),
    valor              NUMERIC(4,2) NOT NULL CHECK (valor >= 0 AND valor <= 10),
    registrado_por     INTEGER NOT NULL REFERENCES usuarios(id_usuario),
    fecha_registro     TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (id_estudiante, id_materia, id_periodo, id_tipo_evaluacion)
);

-- Auditoría: quién cambió qué y cuándo (poblada por triggers, no manualmente)
CREATE TABLE auditoria (
    id_auditoria     SERIAL PRIMARY KEY,
    tabla_afectada   VARCHAR(50) NOT NULL,
    operacion        VARCHAR(10) NOT NULL CHECK (operacion IN ('INSERT','UPDATE','DELETE')),
    id_registro      INTEGER,
    usuario_bd       VARCHAR(60) NOT NULL,
    id_usuario_app   INTEGER,
    datos_anteriores JSONB,
    datos_nuevos     JSONB,
    fecha_evento     TIMESTAMP NOT NULL DEFAULT NOW()
);