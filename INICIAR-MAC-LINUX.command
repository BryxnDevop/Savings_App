#!/bin/sh
set -e
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo 'Instala Node.js 22.12 o superior.'; exit 1; }
command -v docker >/dev/null 2>&1 || { echo 'Instala Docker Desktop o Docker Engine con Compose.'; exit 1; }
docker info >/dev/null 2>&1 || { echo 'Inicia Docker Desktop o Docker Engine y vuelve a ejecutar este archivo.'; exit 1; }
node scripts/configure.mjs
docker compose up -d --build --wait
if command -v open >/dev/null 2>&1; then open http://localhost:4173
elif command -v xdg-open >/dev/null 2>&1; then xdg-open http://localhost:4173
else echo 'Abre http://localhost:4173 en tu navegador.'
fi
