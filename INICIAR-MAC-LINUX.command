#!/bin/sh
set -e
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo 'Instala Node.js 24 LTS.'; exit 1; }
if [ ! -d node_modules ]; then npm ci; fi
npm run setup
npm run db:check
npm run build
npm start -- --open
