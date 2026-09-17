#!/bin/sh
set -e

# Las migraciones 10+ no declaran SET search_path (el proceso
# manual usa ALTER DATABASE ... SET search_path). Aqui se
# fija por sesion para que los nombres sin esquema resuelvan
# a colegio. ON_ERROR_STOP: falla rapido en vez de cascada.
export PGOPTIONS="-c search_path=colegio,public"
PSQL="psql -v ON_ERROR_STOP=1 -U postgres -d calificaciones_uteq"

echo "=== [init] Ejecutando migraciones 01-33 ==="

for f in \
  01_schema.sql \
  02_functions_procedures.sql \
  03_triggers_audit.sql \
  04_roles_permissions.sql \
  05_seed_data.sql \
  06_more_data.sql \
  06_sesiones.sql \
  07_add_audit_triggers.sql \
  07_periodo_activo_cursos_ciclos.sql \
  08_tipos_matricula_detalle.sql \
  09_funciones_formula_oficial.sql \
  10_usuarios_roles_especiales.sql \
  11_notas_realistas.sql \
  12_fix_permisos_hashes.sql \
  13_permisos_minimos.sql \
  14_log_respaldos.sql \
  15_triggers_catalogos.sql \
  16_pesos_configurables.sql \
  17_indices_rendimiento.sql \
  18_representantes.sql \
  19_datos_sinteticos.sql \
  20_unique_asignaciones_por_curso.sql \
  21_rol_estudiante_y_matriculas.sql \
  22_actividades.sql \
  23_cierre_notas.sql \
  24_entregas.sql \
  25_adjuntos.sql \
  26_fallas_observaciones.sql \
  27_tipos_reales.sql \
  28_preinscripciones.sql \
  29_supletorios.sql \
  30_cierre_recuperacion.sql \
  31_notas_coherentes.sql \
  32_matricula_cupos.sql \
  33_sin_general.sql
do
  echo "  -> $f"
  $PSQL -f "/docker-entrypoint-initdb.d/sql/$f"
done

echo "=== [init] Configurando password de app_uteq ==="
$PSQL -c "ALTER ROLE app_uteq WITH PASSWORD 'UTEQ2026';"

echo "=== [init] search_path por defecto (igual que instalacion manual) ==="
$PSQL -c "ALTER DATABASE calificaciones_uteq SET search_path TO colegio, public;"
$PSQL -c "ALTER ROLE app_uteq SET search_path TO colegio, public;"

echo "=== [init] Listo ==="
