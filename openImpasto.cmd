@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "BOOTSTRAP=%SCRIPT_DIR%scripts\open-impasto-windows.ps1"

if exist "%BOOTSTRAP%" goto run_bootstrap

echo Could not find "%BOOTSTRAP%".
echo Make sure you are launching Impasto from the project folder.
pause
exit /b 1

:run_bootstrap
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%BOOTSTRAP%"
set "EXIT_CODE=%ERRORLEVEL%"

if "%EXIT_CODE%"=="0" exit /b 0

echo.
echo Impasto could not start. See the messages above for details.
pause

exit /b %EXIT_CODE%
