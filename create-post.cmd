@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js no esta disponible. Instalalo o agregalo al PATH.
  pause
  exit /b 1
)

if not exist "node_modules\marked\package.json" (
  where npm >nul 2>&1
  if errorlevel 1 (
    echo ERROR: faltan dependencias y npm no esta disponible.
    pause
    exit /b 1
  )
  echo Instalando dependencias del editor...
  call npm install
  if errorlevel 1 (
    echo ERROR: no se pudieron instalar las dependencias.
    pause
    exit /b 1
  )
)

node scripts\content-editor\server.js news
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (
  echo Editor de Noticias cerrado correctamente.
) else (
  echo No se pudo abrir el editor de Noticias.
)
pause
exit /b %RESULT%
