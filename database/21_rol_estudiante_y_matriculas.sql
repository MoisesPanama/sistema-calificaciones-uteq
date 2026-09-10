-- =========================================================
-- 21_rol_estudiante_y_matriculas.sql — completar lo que el
-- commit de dashboard-estudiante/matriculas asumio sin migrar:
--   1. Rol 'estudiante' (dashboard, sidebar y consulta propia
--      lo referencian; sin la fila, crear usuarios estudiante
--      falla por FK).
--   2. DELETE en matriculas para app_uteq (la ruta DELETE
--      /api/matriculas/:id lo necesita; la 13 no lo otorgo).
-- Aplicar UNA vez:
--   psql -h localhost -U postgres -d calificaciones_uteq -f database/21_rol_estudiante_y_matriculas.sql
-- =========================================================

SET search_path TO colegio;

INSERT INTO roles (nombre_rol) VALUES ('estudiante')
ON CONFLICT (nombre_rol) DO NOTHING;

-- Borrado solo via ruta de admin (desmatricular), con rastro
-- en auditoria (trigger generico ya cubre matriculas? NO:
-- agregar trigger si falta).
GRANT DELETE ON matriculas TO app_uteq;

-- Auditoria para matriculas (alta/baja de matriculas debe
-- quedar registrada como el resto de movimientos).
DROP TRIGGER IF EXISTS trg_auditoria_matriculas ON matriculas;
CREATE TRIGGER trg_auditoria_matriculas
AFTER INSERT OR UPDATE OR DELETE ON matriculas
FOR EACH ROW
EXECUTE FUNCTION fn_auditoria_generica('id_matricula');
