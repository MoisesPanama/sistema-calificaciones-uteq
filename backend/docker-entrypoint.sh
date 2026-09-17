#!/bin/sh
# =========================================================
# docker-entrypoint.sh — migraciones + seeds idempotentes y
# arranque de la API. Re-ejecutable: si la BD ya tiene datos,
# solo arranca (igual que setup.ps1).
# =========================================================
set -e

: "${DB_HOST:=db}"
: "${DB_PORT:=5432}"
: "${DB_NAME:=calificaciones_uteq}"
: "${DB_USER:=app_uteq}"
: "${DB_PASSWORD:=cambiar_esta_password}"
: "${DB_SUPER_PASSWORD:=postgres}"

export PGPASSWORD="$DB_SUPER_PASSWORD"

echo "Esperando PostgreSQL en $DB_HOST:$DB_PORT..."
for i in $(seq 1 30); do
  if psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -d postgres -c 'SELECT 1' >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

NEEDS_SCHEMA=$(psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -d "$DB_NAME" -t -A \
  -c "SELECT COUNT(*) FROM colegio.usuarios;" 2>/dev/null || echo "init")

if [ "$NEEDS_SCHEMA" = "init" ] || [ "$NEEDS_SCHEMA" = "0" ]; then
  echo "Aplicando migraciones 01..33..."
  psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -d "$DB_NAME" \
    -c "ALTER DATABASE \"$DB_NAME\" SET search_path TO colegio, public;" >/dev/null
  for f in /migrations/01_schema.sql \
           /migrations/02_functions_procedures.sql \
           /migrations/03_triggers_audit.sql \
           /migrations/04_roles_permissions.sql \
           /migrations/05_seed_data.sql \
           /migrations/06_more_data.sql \
           /migrations/06_sesiones.sql \
           /migrations/07_periodo_activo_cursos_ciclos.sql \
           /migrations/08_tipos_matricula_detalle.sql \
           /migrations/09_funciones_formula_oficial.sql \
           /migrations/10_usuarios_roles_especiales.sql \
           /migrations/11_notas_realistas.sql \
           /migrations/12_fix_permisos_hashes.sql \
           /migrations/13_permisos_minimos.sql \
           /migrations/14_log_respaldos.sql \
           /migrations/15_triggers_catalogos.sql \
           /migrations/16_pesos_configurables.sql \
           /migrations/17_indices_rendimiento.sql \
           /migrations/18_representantes.sql \
           /migrations/19_datos_sinteticos.sql \
           /migrations/20_unique_asignaciones_por_curso.sql \
           /migrations/21_rol_estudiante_y_matriculas.sql \
           /migrations/22_actividades.sql \
           /migrations/23_cierre_notas.sql \
           /migrations/24_entregas.sql \
           /migrations/25_adjuntos.sql \
           /migrations/26_fallas_observaciones.sql \
           /migrations/27_tipos_reales.sql \
           /migrations/28_preinscripciones.sql \
           /migrations/29_supletorios.sql \
           /migrations/30_cierre_recuperacion.sql \
           /migrations/31_notas_coherentes.sql \
           /migrations/32_matricula_cupos.sql \
           /migrations/33_sin_general.sql; do
    echo "-> $(basename $f)"
    psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$f" >/dev/null
  done
  echo "Passwords de prueba..."
  node scripts/seed-passwords.js || true
  TEST_USER_PASSWORD="${TEST_USER_PASSWORD:-UTEQ2026}" node scripts/seed-test-users.js || true
else
  echo "BD ya inicializada ($NEEDS_SCHEMA usuarios): se omite migracion."
fi

unset PGPASSWORD
echo "Iniciando API..."
exec "$@"
