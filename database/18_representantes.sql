-- =========================================================
-- 18_representantes.sql — CRUD de representantes (UI)
-- Aplicar UNA vez:
--   psql -h localhost -U postgres -d calificaciones_uteq -f database/18_representantes.sql
--
-- 1. Auditoria para representantes (faltaba como en la 15):
--    el trigger generico deja rastro de altas/bajas/cambios.
-- 2. DELETE para app_uteq: la migracion 13 no lo otorgo y la
--    ruta DELETE lo necesita. Solo borrado sin estudiantes
--    asociados (la ruta verifica y responde 409 si los hay).
-- =========================================================

SET search_path TO colegio;

DROP TRIGGER IF EXISTS trg_auditoria_representantes ON representantes;
CREATE TRIGGER trg_auditoria_representantes
AFTER INSERT OR UPDATE OR DELETE ON representantes
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_representante');

-- Borrado solo via ruta con verificacion previa de uso.
GRANT DELETE ON representantes TO app_uteq;

-- Borrado de asignaciones (ruta DELETE /api/asignaciones/:id,
-- solo admin, con rastro en auditoria).
GRANT DELETE ON profesor_materia_periodo TO app_uteq;
