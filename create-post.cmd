@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm no esta disponible. Instala Node.js o agrega npm al PATH.
  pause
  exit /b 1
)

call npm run create-news
set "RESULT=%ERRORLEVEL%"
echo.
if "%RESULT%"=="0" (
  echo Borrador de noticia creado correctamente.
) else (
  echo No se pudo crear el borrador de noticia.
)
pause
exit /b %RESULT%
