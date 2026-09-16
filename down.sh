#!/usr/bin/env bash
# =========================================================
# down.sh — Detener el proyecto (stack Docker).
#
# Uso:
#   ./down.sh              Detiene y conserva los datos (volumen)
#   ./down.sh --volumes    Detiene y BORRA los datos de la BD
# =========================================================
set -euo pipefail

cd "$(dirname "$0")"

if [[ "${1:-}" == "--volumes" ]]; then
  echo "=== Deteniendo y BORRANDO datos de la BD ==="
  read -r -p "Confirma borrar la BD Docker (s/N): " resp
  if [[ "$resp" =~ ^[Ss]$ ]]; then
    docker compose down -v
    echo "Proyecto detenido y datos borrados."
  else
    echo "Cancelado (nada se detuvo)."
  fi
else
  echo "=== Deteniendo proyecto (datos conservados) ==="
  docker compose down
  echo "Proyecto detenido. Datos en volumen Docker (./down.sh --volumes para borrarlos)."
fi
