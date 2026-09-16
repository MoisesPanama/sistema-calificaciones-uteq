# =========================================================
# up.ps1 — Levantar el proyecto (stack Docker) en Windows.
#
# Uso (terminal PowerShell, en la raiz del repo):
#   powershell -ExecutionPolicy Bypass -File .\up.ps1
#   powershell -ExecutionPolicy Bypass -File .\up.ps1 -Build
#   $env:APP_PORT=3001; $env:DB_PORT=5433; .\up.ps1
#
# Para detener: .\down.ps1
# =========================================================
param([switch]$Build)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)

if (-not $env:APP_PORT) { $env:APP_PORT = '3001' }
if (-not $env:DB_PORT) { $env:DB_PORT = '5433' }
$appPort = $env:APP_PORT

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host 'ERROR: docker no esta instalado o no esta en el PATH.' -ForegroundColor Red
  exit 1
}

Write-Host ''
Write-Host "=== Levantando BD (host:$($env:DB_PORT)) + app (host:$appPort) ===" -ForegroundColor Cyan
if ($Build) { docker compose up -d --build } else { docker compose up -d }

Write-Host '=== Esperando API saludable (max 120s) ===' -ForegroundColor Cyan
$ok = $false
for ($i = 1; $i -le 60; $i++) {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:$appPort/api/health" -TimeoutSec 2 -UseBasicParsing
    if ($r.StatusCode -eq 200) { $ok = $true; break }
  } catch { Start-Sleep -Seconds 2 }
}
if (-not $ok) {
  Write-Host 'ERROR: la API no respondio. Revisa: docker compose logs app' -ForegroundColor Red
  exit 1
}
Write-Host 'API lista.' -ForegroundColor Green

@"

Proyecto arriba:
  App (Docker):  http://localhost:$appPort
  BD (Docker):   localhost:$($env:DB_PORT) / calificaciones_uteq / app_uteq

Credenciales de prueba (clave UTEQ2026):
  admin@uteq.edu.ec | elena.romero@uteq.edu.ec
  fernando.castillo@uteq.edu.ec | maria.torres@uteq.edu.ec

Para detener: .\down.ps1   (datos persistentes en volumen Docker)
"@
