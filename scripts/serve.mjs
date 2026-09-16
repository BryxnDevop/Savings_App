import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { loadEnvFile } from 'node:process';
import { createPool, migrate } from '../server/db.mjs';
import { createMailService } from '../server/mail.mjs';
import { createApi } from '../server/api.mjs';
try { loadEnvFile(new URL('../.env', import.meta.url)); } catch(e) { if(e.code !== 'ENOENT') throw e; }

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const appPort = Number(process.env.PORT || 4173);
const appHost = process.env.APP_HOST || '127.0.0.1';
if (!Number.isInteger(appPort) || appPort < 1 || appPort > 65535) { console.error('PORT debe ser un puerto entre 1 y 65535.'); process.exit(1); }
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
try { await stat(resolve(root, 'index.html')); }
catch { console.error('No existe dist/. Ejecuta npm install y npm run build primero.'); process.exit(1); }
const origin = process.env.APP_ORIGIN || `http://localhost:${appPort}`;
const origins = [origin];
if (new URL(origin).hostname === 'localhost') origins.push(origin.replace('localhost', '127.0.0.1'));
if (process.env.NODE_ENV !== 'production') origins.push('http://localhost:5173', 'http://127.0.0.1:5173');
const pool = createPool(process.env.DATABASE_URL);
try { await migrate(pool); } catch (e) { console.error('No se pudo iniciar PostgreSQL. Revisa DATABASE_URL y que la base esté disponible. Código:', e.code || 'DB_ERROR'); await pool.end(); process.exit(1); }
const mailService = createMailService(pool);
const api = createApi(pool, { origins, mailService });
mailService.start();
const server = createServer(async (req, res) => {
  if (await api(req, res)) return;
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = resolve(root, '.' + path);
    if (file !== resolve(root) && !file.startsWith(resolve(root) + sep)) { res.writeHead(403); res.end(); return; }
    if (path.split('/').some(part => part.startsWith('.') && part !== '')) { res.writeHead(403); res.end(); return; }
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    const bytes = await readFile(file);
    const type = mime[extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': bytes.length, 'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    res.writeHead(error instanceof URIError ? 400 : 404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No se encontró el recurso. Abre la dirección principal de Ahorra+.');
  }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `El puerto ${appPort} ya está en uso. Abre http://localhost:${appPort} si Ahorra+ ya está ejecutándose, o cierra la otra instancia.` : error.message);
  process.exit(1);
});
server.listen(appPort, appHost, () => {
  const address = `http://localhost:${appPort}`;
  console.log(`\nAhorra+ está lista en ${address}\nMantén esta ventana abierta. Para detenerla: Ctrl+C.\n`);
  if (process.argv.includes('--open')) {
    const command = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', address]] : process.platform === 'darwin' ? ['open', [address]] : ['xdg-open', [address]];
    const child = spawn(command[0], command[1], { detached: true, stdio: 'ignore' });
    child.on('error', () => console.log(`Abre ${address} en tu navegador.`));
    child.unref();
  }
});

for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { mailService.stop(); server.close(async () => { await pool.end(); process.exit(0); }); server.closeIdleConnections(); });
