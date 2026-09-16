#!/usr/bin/env bash
# =========================================================
# up.sh — Levantar el proyecto (stack Docker).
#
# Uso:
#   ./up.sh            Levanta BD + app (reusa imagen si existe)
#   ./up.sh --build    Reconstruye la imagen del backend
#   APP_PORT=3001 DB_PORT=5433 ./up.sh   Puertos personalizados
#
# Al final imprime URLs y credenciales de prueba.
# Para detener: ./down.sh
# =========================================================
set -euo pipefail

: "${APP_PORT:=3001}"
: "${DB_PORT:=5433}"
export APP_PORT DB_PORT

BUILD=""
if [[ "${1:-}" == "--build" ]]; then
  BUILD="--build"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker no esta instalado o no esta en el PATH." >&2
  exit 1
fi

cd "$(dirname "$0")"

echo "=== Levantando BD (host:$DB_PORT) + app (host:$APP_PORT) ==="
# shellcheck disable=SC2086
docker compose up -d $BUILD

echo "=== Esperando API saludable (max 120s) ==="
for i in $(seq 1 60); do
  if curl -sf -m 2 "http://localhost:${APP_PORT}/api/health" >/dev/null 2>&1; then
    echo "API lista."
    break
  fi
  if [[ "$i" == "60" ]]; then
    echo "ERROR: la API no respondio. Revisa: docker compose logs app" >&2
    exit 1
  fi
  sleep 2
done

cat <<EOF

Proyecto arriba:
  App (Docker):  http://localhost:${APP_PORT}
  BD (Docker):   localhost:${DB_PORT} / calificaciones_uteq / app_uteq

Credenciales de prueba (clave UTEQ2026):
  admin@uteq.edu.ec | elena.romero@uteq.edu.ec
  fernando.castillo@uteq.edu.ec | maria.torres@uteq.edu.ec

Para detener: ./down.sh   (datos persistentes en volumen Docker)
EOF
