@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
if "%PORT%"=="" set "PORT=4310"
set "APP_URL=http://127.0.0.1:%PORT%"

cd /d "%SCRIPT_DIR%"

if not exist "data" mkdir "data"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required but was not found on this PC.
  echo Opening the official Node.js download page...
  start "" "https://nodejs.org/en/download"
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is required but was not found on this PC.
  echo Opening the official Node.js download page...
  start "" "https://nodejs.org/en/download"
  exit /b 1
)

for /f "delims=" %%v in ('node -p "process.versions.node.split('.')[0]"') do set "NODE_MAJOR=%%v"
if %NODE_MAJOR% LSS 24 (
  echo Impasto requires Node.js 24+.
  echo Current Node.js version:
  node -v
  echo Opening the official Node.js download page...
  start "" "https://nodejs.org/en/download"
  exit /b 1
)

set "NEED_INSTALL="
if not exist "node_modules" set "NEED_INSTALL=1"
if not exist "node_modules\lucide-react" set "NEED_INSTALL=1"

if defined NEED_INSTALL (
  echo Installing dependencies from package-lock.json...
  call npm ci
  if errorlevel 1 exit /b 1
)

echo Starting Impasto...
start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$url = '%APP_URL%'; for ($i = 0; $i -lt 80; $i++) { try { Invoke-WebRequest -Uri $url -UseBasicParsing | Out-Null; Start-Process $url; exit 0 } catch { Start-Sleep -Milliseconds 500 } }; Start-Process $url"
echo Keep this window open while using Impasto.
call npm run dev -- -p %PORT%
