# =========================================================
# setup.ps1 — Levantar el proyecto con UN solo comando.
#
# Uso (en la raiz del repo, terminal de VS Code):
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1
#
# Hace todo, en orden, y es re-ejecutable sin romper nada:
#   1. Verifica Node 20+, npm y psql en el PATH.
#   2. npm install en backend/ (unicas descargas: dependencias npm).
#   3. Crea backend/.env desde .env.example si no existe.
#   4. Crea rol app_uteq + base de datos (pide UNA vez el
#      password del superusuario postgres, solo si falta algo).
#   5. Ejecuta database/01..09 en orden (solo si la BD esta vacia).
#   6. Fija search_path + asigna passwords del seed (bcrypt).
#   7. Levanta el servidor (npm run dev -> http://localhost:3000).
#
# Requisitos previos (lo unico a instalar a mano, una vez):
#   Node.js 20+, PostgreSQL 18 y Git.
# =========================================================

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root 'backend'

function Write-Step([string]$m) {
    Write-Host ''
    Write-Host "=== $m ===" -ForegroundColor Cyan
}

function Read-DotEnv([string]$path) {
    $cfg = @{}
    Get-Content -LiteralPath $path | ForEach-Object {
        if ($_ -match '^\s*([^#=\s][^=]*?)\s*=\s*(.*?)\s*$') {
            $cfg[$matches[1].Trim()] = $matches[2].Trim()
        }
    }
    return $cfg
}

function Escape-Sql([string]$s) { return $s.Replace("'", "''") }

# ---------- 1. Requisitos ----------
Write-Step 'Verificando requisitos'
foreach ($cmd in @('node', 'npm', 'psql')) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "Falta '$cmd' en el PATH. Instala Node.js 20+ (https://nodejs.org) y PostgreSQL 18 (https://www.postgresql.org/download/) y vuelve a ejecutar."
    }
}
$nodeMajor = [int]((& node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) { throw "Se requiere Node.js 20 o superior (actual: $(& node --version))." }
Write-Host 'OK: node, npm y psql disponibles.'

# ---------- 2. Dependencias ----------
Write-Step 'Instalando dependencias (npm install)'
& npm install --prefix $Backend
if (-not $?) { throw 'npm install fallo.' }

# ---------- 3. .env ----------
Write-Step 'Configurando .env'
$envFile = Join-Path $Backend '.env'
if (-not (Test-Path -LiteralPath $envFile)) {
    Copy-Item -LiteralPath (Join-Path $Backend '.env.example') -Destination $envFile
    Write-Host '.env creado desde .env.example (valores por defecto listos para desarrollo).'
} else {
    Write-Host '.env ya existe, se conserva.'
}
$cfg = Read-DotEnv $envFile
$DbHost = $cfg['DB_HOST']; $DbPort = $cfg['DB_PORT']; $DbName = $cfg['DB_NAME']
$DbUser = $cfg['DB_USER']; $DbPass = $cfg['DB_PASSWORD']; $AppPort = $cfg['PORT']
if (-not $DbHost -or -not $DbName -or -not $DbUser -or -not $DbPass) { throw '.env incompleto: faltan DB_HOST/DB_NAME/DB_USER/DB_PASSWORD.' }

$pgSuper = $env:PG_SUPERUSER
if (-not $pgSuper) { $pgSuper = 'postgres' }

function Invoke-AsApp([string]$sql, [string]$db) {
    $env:PGPASSWORD = $DbPass
    try {
        return & psql -h $DbHost -p $DbPort -U $DbUser -d $db -tAc $sql 2>$null
    } finally {
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    }
}

function Invoke-AsSuper([string]$sql, [string]$db = 'postgres') {
    return & psql -h $DbHost -p $DbPort -U $pgSuper -d $db -tAc $sql
}

# ---------- 4/5. Base de datos ----------
Write-Step 'Preparando base de datos'
$appOk = $false
$probe = Invoke-AsApp 'SELECT 1' $DbName
if ($?) { $appOk = $true }

if (-not $appOk) {
    Write-Host 'Se necesita el superusuario de PostgreSQL para crear rol/BD (solo esta vez).'
    $sec = Read-Host "Password del superusuario '$pgSuper'" -AsSecureString
    $superPass = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
    $env:PGPASSWORD = $superPass
    try {
        $roleExists = Invoke-AsSuper "SELECT 1 FROM pg_roles WHERE rolname = '$(Escape-Sql $DbUser)'"
        if (-not $?) { throw "No se pudo conectar como '$pgSuper'. Revisa host/puerto/password." }
        if ($roleExists -notmatch '1') {
            Invoke-AsSuper "CREATE ROLE $(Escape-Sql $DbUser) LOGIN PASSWORD '$(Escape-Sql $DbPass)'" | Out-Null
            Write-Host "Rol '$DbUser' creado."
        } else {
            Invoke-AsSuper "ALTER ROLE $(Escape-Sql $DbUser) WITH LOGIN PASSWORD '$(Escape-Sql $DbPass)'" | Out-Null
        }
        $dbExists = Invoke-AsSuper "SELECT 1 FROM pg_database WHERE datname = '$(Escape-Sql $DbName)'"
        if ($dbExists -notmatch '1') {
            Invoke-AsSuper "CREATE DATABASE $(Escape-Sql $DbName)" | Out-Null
            Write-Host "Base '$DbName' creada."
        }
        Invoke-AsSuper "GRANT rol_admin TO $(Escape-Sql $DbUser)" $DbName 2>$null
    } finally {
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    }
}

# Esquema ya cargado? (para no re-ejecutar 01..09 si existe)
$regclass = Invoke-AsApp "SELECT to_regclass('colegio.usuarios')" $DbName
$needsSchema = $true
if ($? -and $regclass -match 'usuarios') {
    $n = Invoke-AsApp 'SELECT COUNT(*) FROM colegio.usuarios' $DbName
    if ($? -and [int]$n.Trim() -gt 0) { $needsSchema = $false }
}

if ($needsSchema) {
    Write-Step 'Ejecutando migraciones database/01..09'
    $env:PGPASSWORD = $DbPass
    try {
        for ($i = 1; $i -le 9; $i++) {
            $file = Get-ChildItem -LiteralPath (Join-Path $Root 'database') -Filter ("0$i" + '_*.sql') | Select-Object -First 1
            if (-not $file) { throw "No se encontro el script 0$i en database/." }
            Write-Host "-> $($file.Name)"
            & psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -v ON_ERROR_STOP=1 -f $file.FullName | Out-Null
            if (-not $?) { throw "Fallo al ejecutar $($file.Name)." }
        }
        & psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -c "ALTER DATABASE $(Escape-Sql $DbName) SET search_path TO colegio, public;" | Out-Null
    } finally {
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    }
} else {
    Write-Step 'Base de datos ya inicializada (se omite 01..09)'
}

# ---------- 6. Passwords del seed ----------
Write-Step 'Asignando passwords de prueba (bcrypt)'
Push-Location -LiteralPath $Backend
try {
    & node scripts/seed-passwords.js
    if (-not $?) { throw 'seed-passwords fallo.' }
} finally {
    Pop-Location
}

# ---------- 7. Levantar ----------
Write-Step 'Todo listo. Levantando el servidor'
Write-Host 'URL:      http://localhost:PORT'.Replace('PORT', $AppPort)
Write-Host 'Usuarios: admin@uteq.edu.ec / admin123 (admin)'
Write-Host '          carla.vera@uteq.edu.ec / profesor123 (profesora)'
Write-Host '          jorge.mendoza@uteq.edu.ec / profesor123 (profesor)'
& npm run dev --prefix $Backend
