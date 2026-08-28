@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm no esta disponible. Instala Node.js o agrega npm al PATH.
  pause
  exit /b 1
)

call npm run create-health
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (
  echo Borrador de Salud creado correctamente.
) else (
  echo No se pudo crear el borrador de Salud.
)
pause
exit /b %RESULT%
