-- =========================================================
-- 07_add_audit_triggers.sql
-- Agrega triggers de auditoria a las tablas que faltan
-- =========================================================

SET search_path TO colegio;

-- Estudiantes
CREATE TRIGGER trg_auditoria_estudiantes
AFTER INSERT OR UPDATE OR DELETE ON estudiantes
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_estudiante');

-- Materias
CREATE TRIGGER trg_auditoria_materias
AFTER INSERT OR UPDATE OR DELETE ON materias
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_materia');

-- Periodos academicos
CREATE TRIGGER trg_auditoria_periodos
AFTER INSERT OR UPDATE OR DELETE ON periodos_academicos
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_periodo');

-- Profesores
CREATE TRIGGER trg_auditoria_profesores
AFTER INSERT OR UPDATE OR DELETE ON profesores
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_profesor');

-- Tipos de evaluacion
CREATE TRIGGER trg_auditoria_tipos_evaluacion
AFTER INSERT OR UPDATE OR DELETE ON tipos_evaluacion
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_tipo_evaluacion');

-- Profesor materia periodo (asignaciones)
CREATE TRIGGER trg_auditoria_profesor_materia_periodo
AFTER INSERT OR UPDATE OR DELETE ON profesor_materia_periodo
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_asignacion');
