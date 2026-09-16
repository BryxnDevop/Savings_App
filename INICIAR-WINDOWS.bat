@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instala Node.js 22.12 o superior desde https://nodejs.org/
  pause
  exit /b 1
)
where docker >nul 2>nul
if errorlevel 1 (
  echo Instala Docker Desktop e inicialo antes de continuar.
  pause
  exit /b 1
)
docker info >nul 2>nul
if errorlevel 1 (
  echo Abre Docker Desktop y espera a que el motor Linux este listo.
  echo Luego vuelve a abrir este archivo. Consulta README.md si no arranca.
  pause
  exit /b 1
)
node scripts\configure.mjs
if errorlevel 1 goto error
docker compose up -d --build --wait
if errorlevel 1 goto error
start "" http://localhost:4173
echo Ahorra+ esta lista. Crea tu cuenta en la pantalla de inicio.
pause
exit /b 0
:error
echo No se pudo iniciar. Revisa que Docker Desktop este abierto y consulta README.md.
pause
exit /b 1
