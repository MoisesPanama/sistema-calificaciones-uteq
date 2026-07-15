-- =========================================================
-- 04_roles_permissions.sql
-- Roles de PostgreSQL con permisos diferenciados
-- =========================================================

SET search_path TO colegio;

-- ---------------------------------------------------------
-- rol_lectura: solo puede hacer SELECT en todo el esquema.
-- ---------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rol_lectura') THEN
        CREATE ROLE rol_lectura NOLOGIN;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA colegio TO rol_lectura;
GRANT SELECT ON ALL TABLES IN SCHEMA colegio TO rol_lectura;
ALTER DEFAULT PRIVILEGES IN SCHEMA colegio
    GRANT SELECT ON TABLES TO rol_lectura;

-- ---------------------------------------------------------
-- rol_profesor: SELECT en todo, pero INSERT/UPDATE solo en
-- calificaciones. Sin ningun acceso a usuarios ni auditoria.
-- ---------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rol_profesor') THEN
        CREATE ROLE rol_profesor NOLOGIN;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA colegio TO rol_profesor;
GRANT SELECT ON ALL TABLES IN SCHEMA colegio TO rol_profesor;
GRANT INSERT, UPDATE ON calificaciones TO rol_profesor;
GRANT USAGE, SELECT ON SEQUENCE calificaciones_id_calificacion_seq TO rol_profesor;

-- Se revoca explicitamente el acceso a usuarios y auditoria,
-- aunque el SELECT general ya se otorgo arriba.
REVOKE ALL ON usuarios FROM rol_profesor;
REVOKE ALL ON auditoria FROM rol_profesor;

-- ---------------------------------------------------------
-- rol_admin: control total, excepto UPDATE/DELETE sobre
-- auditoria, que nadie puede modificar (solo el sistema
-- puede insertar ahi, via trigger).
-- ---------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rol_admin') THEN
        CREATE ROLE rol_admin NOLOGIN;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA colegio TO rol_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA colegio TO rol_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA colegio TO rol_admin;

-- La tabla auditoria es de solo lectura + insercion, incluso
-- para el admin: nadie debe poder alterar el historial.
REVOKE UPDATE, DELETE ON auditoria FROM rol_admin;

-- ---------------------------------------------------------
-- Usuario de conexion que usara la aplicacion Node/Express.
-- Se le asigna rol_admin porque el backend maneja login,
-- gestion de estudiantes, etc. La app decide internamente
-- que puede hacer cada usuario del sistema (tabla usuarios).
-- ---------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_uteq') THEN
        CREATE ROLE app_uteq LOGIN PASSWORD 'cambiar_esta_password';
    END IF;
END
$$;

GRANT rol_admin TO app_uteq;