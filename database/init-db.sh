#!/bin/sh
set -e

PSQL="psql -U postgres -d calificaciones_uteq"

echo "=== [init] Ejecutando migraciones 01-21 ==="

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
  21_rol_estudiante_y_matriculas.sql
do
  echo "  -> $f"
  $PSQL -f "/docker-entrypoint-initdb.d/sql/$f"
done

echo "=== [init] Configurando password de app_uteq ==="
$PSQL -c "ALTER ROLE app_uteq WITH PASSWORD 'UTEQ2026';"

echo "=== [init] Listo ==="
