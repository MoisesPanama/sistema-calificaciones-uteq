-- =========================================================
-- 33_sin_general.sql — Super plan M10 (sin asignacion General)
-- Aplicar UNA vez como superusuario:
--   psql -h localhost -U postgres -d calificaciones_uteq \
--     -f database/33_sin_general.sql
--
-- REGLA: toda asignacion docente es a un curso concreto.
-- El "General" (id_curso NULL) se elimina por completo: el
-- trigger rechaza escrituras nuevas con NULL (el historial
-- viejo se conserva intacto). La fila basura 16 de pruebas
-- (materia E2E + NULL) se borra solo si sigue huerfana
-- (sin calificaciones ni actividades asociadas).
-- =========================================================

SET search_path TO colegio;

CREATE OR REPLACE FUNCTION fn_prohibir_asignacion_general()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.id_curso IS NULL THEN
        RAISE EXCEPTION 'Asignacion General eliminada: toda materia se asigna a un curso concreto (M10)';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sin_asignacion_general ON profesor_materia_periodo;
CREATE TRIGGER trg_sin_asignacion_general
BEFORE INSERT OR UPDATE ON profesor_materia_periodo
FOR EACH ROW
EXECUTE FUNCTION fn_prohibir_asignacion_general();

-- Limpieza de la fila de pruebas (solo si esta huerfana).
DELETE FROM profesor_materia_periodo pmp
WHERE pmp.id_curso IS NULL
  AND NOT EXISTS (SELECT 1 FROM calificaciones c WHERE c.id_materia = pmp.id_materia AND c.id_periodo = pmp.id_periodo)
  AND NOT EXISTS (
      SELECT 1 FROM actividades a
      WHERE a.id_materia = pmp.id_materia AND a.id_periodo = pmp.id_periodo
  );
