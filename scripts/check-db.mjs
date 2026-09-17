import { loadEnvFile } from 'node:process';
import { createPool, checkSchema } from '../server/db.mjs';
import { connectionError } from '../server/connection.mjs';
try { loadEnvFile(new URL('../.env', import.meta.url)); } catch(e) { if(e.code !== 'ENOENT') throw e; }
let pool;
try {
  pool = createPool(process.env.DATABASE_URL);
  await checkSchema(pool);
  console.log('Conexión correcta. Esquema ahorra v1 instalado y accesible. Puedes ejecutar npm start.');
} catch (e) {
  console.error(connectionError(e)); process.exitCode = 1;
} finally { if(pool) await pool.end(); }
