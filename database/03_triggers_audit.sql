-- =========================================================
-- 03_triggers_audit.sql
-- Trigger de validacion y trigger generico de auditoria
-- =========================================================

SET search_path TO colegio;

-- ---------------------------------------------------------
-- Trigger de validacion: verifica rango 0-10 antes de
-- insertar o actualizar una calificacion directamente
-- en la tabla (defensa a nivel de BD, no solo en el SP).
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validar_calificacion()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.valor IS NULL THEN
        RAISE EXCEPTION 'La calificacion no puede ser nula';
    END IF;

    IF NEW.valor < 0 OR NEW.valor > 10 THEN
        RAISE EXCEPTION 'La calificacion % esta fuera de rango (0 a 10)', NEW.valor;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validar_calificacion
BEFORE INSERT OR UPDATE ON calificaciones
FOR EACH ROW
EXECUTE FUNCTION fn_validar_calificacion();

-- ---------------------------------------------------------
-- Trigger generico de auditoria: registra en la tabla
-- auditoria el estado anterior y nuevo (JSONB) de cualquier
-- INSERT/UPDATE/DELETE, usando app.current_user_id que
-- Node setea con SET LOCAL antes de cada operacion.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_auditoria_generica()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql;

-- Se aplica el trigger a las 3 tablas requeridas, pasando
-- como argumento el nombre de la columna PK de cada una.
CREATE TRIGGER trg_auditoria_calificaciones
AFTER INSERT OR UPDATE OR DELETE ON calificaciones
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_calificacion');

CREATE TRIGGER trg_auditoria_usuarios
AFTER INSERT OR UPDATE OR DELETE ON usuarios
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_usuario');

CREATE TRIGGER trg_auditoria_matriculas
AFTER INSERT OR UPDATE OR DELETE ON matriculas
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_matricula');