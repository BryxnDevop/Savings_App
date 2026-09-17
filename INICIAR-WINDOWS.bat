@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instala Node.js 22.12 o superior desde https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 goto error
)
call npm run setup
if errorlevel 1 goto error
call npm run db:check
if errorlevel 1 goto error
call npm start -- --open
if errorlevel 1 goto error
exit /b 0
:error
echo Revisa docs\SUPABASE.md. Configura Supabase y .env antes de iniciar.
pause
exit /b 1
