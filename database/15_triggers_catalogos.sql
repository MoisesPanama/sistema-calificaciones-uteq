-- =========================================================
-- 15_triggers_catalogos.sql — Plan v2 Fase 6 (CRUD catalogos)
-- Aplicar UNA vez:
--   psql -h localhost -U postgres -d calificaciones_uteq -f database/15_triggers_catalogos.sql
--
-- PROBLEMA QUE CORRIGE: la migracion 07_add_audit_triggers.sql
-- cubrio estudiantes/materias/periodos/tipos/asignaciones pero
-- dejo fuera cursos, ciclos y parciales. Como la Fase 6 les da
-- CRUD en la UI, sus cambios quedarian sin rastro en auditoria.
--
-- SOLUCION: los mismos triggers genericos (fn_auditoria_generica)
-- sobre esas tres tablas. No requieren GRANTs nuevos: el trigger
-- escribe en auditoria con los privilegios del invocante y la
-- migracion 13 ya otorgo INSERT en auditoria a app_uteq.
-- =========================================================

SET search_path TO colegio;

-- Cursos
DROP TRIGGER IF EXISTS trg_auditoria_cursos ON cursos;
CREATE TRIGGER trg_auditoria_cursos
AFTER INSERT OR UPDATE OR DELETE ON cursos
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_curso');

-- Ciclos evaluativos
DROP TRIGGER IF EXISTS trg_auditoria_ciclos ON ciclos_evaluativos;
CREATE TRIGGER trg_auditoria_ciclos
AFTER INSERT OR UPDATE OR DELETE ON ciclos_evaluativos
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_ciclo');

-- Parciales
DROP TRIGGER IF EXISTS trg_auditoria_parciales ON parciales;
CREATE TRIGGER trg_auditoria_parciales
AFTER INSERT OR UPDATE OR DELETE ON parciales
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_parcial');
