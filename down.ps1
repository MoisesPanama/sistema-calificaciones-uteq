# =========================================================
# down.ps1 — Detener el proyecto (stack Docker) en Windows.
#
# Uso (terminal PowerShell, en la raiz del repo):
#   powershell -ExecutionPolicy Bypass -File .\down.ps1
#   powershell -ExecutionPolicy Bypass -File .\down.ps1 -Volumes  # BORRA la BD
# =========================================================
param([switch]$Volumes)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

if ($Volumes) {
  Write-Host '=== Deteniendo y BORRANDO datos de la BD ===' -ForegroundColor Yellow
  $resp = Read-Host 'Confirma borrar la BD Docker (s/N)'
  if ($resp -match '^[Ss]$') {
    docker compose down -v
    Write-Host 'Proyecto detenido y datos borrados.' -ForegroundColor Green
  } else {
    Write-Host 'Cancelado (nada se detuvo).'
  }
} else {
  Write-Host '=== Deteniendo proyecto (datos conservados) ===' -ForegroundColor Cyan
  docker compose down
  Write-Host 'Proyecto detenido. Datos en volumen Docker (.\down.ps1 -Volumes para borrarlos).' -ForegroundColor Green
}
