import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs, parseEnv } from 'node:util';
import { createPool, connectionError } from '../server/connection.mjs';
import { exportData, importData } from '../server/transfer.mjs';
const {values,positionals} = parseArgs({allowPositionals:true,options:{env:{type:'string',default:'.env'},file:{type:'string'},legacy:{type:'boolean',default:false}}});
const command = positionals[0];
if (!['export','import'].includes(command) || !values.file || (values.legacy && command !== 'export')) {
  console.error('Uso: npm run db:export -- --file backups/copia.json [--env .env.legacy --legacy]\n     npm run db:import -- --file backups/copia.json'); process.exit(1);
}
let pool;
try {
  const env = {...parseEnv(await readFile(resolve(values.env),'utf8'))};
  let url = env.DATABASE_URL;
  if(values.legacy) {
    if(!env.POSTGRES_PASSWORD) throw Object.assign(new Error('Falta POSTGRES_PASSWORD en el archivo de configuración antiguo.'),{code:'TRANSFER_ERROR'});
    url = `postgresql://${encodeURIComponent(env.POSTGRES_USER||'ahorra')}:${encodeURIComponent(env.POSTGRES_PASSWORD)}@127.0.0.1:5433/${encodeURIComponent(env.POSTGRES_DB||'ahorra_plus')}`;
  }
  pool = createPool(url, env);
  if(command === 'export') {
    const backup = await exportData(pool,values.legacy?'public':'ahorra');
    await mkdir(dirname(resolve(values.file)),{recursive:true});
    await writeFile(resolve(values.file),JSON.stringify(backup,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log('Respaldo completo creado. Guárdalo en un lugar privado junto con tu MAIL_ENCRYPTION_KEY.');
    console.log(Object.entries(backup.tables).map(([name,rows])=>`${name}: ${rows.length}`).join('\n'));
  } else {
    const counts = await importData(pool,JSON.parse(await readFile(resolve(values.file),'utf8')));
    console.log('Importación confirmada. Se conservaron las cuentas, contraseñas y registros.');
    console.log(Object.entries(counts).map(([name,count])=>`${name}: ${count}`).join('\n'));
    console.log('Conserva MAIL_ENCRYPTION_KEY del servidor anterior para que Gmail pueda descifrar sus credenciales.');
  }
} catch(e) {
  console.error(e.code === 'TRANSFER_ERROR' ? e.message : e.code === 'EEXIST' ? 'El archivo ya existe. Usa un nombre nuevo; no se sobrescribió.' : ['ENOENT','EACCES'].includes(e.code) ? 'No se pudo acceder al archivo. Revisa la ruta y los permisos.' : e instanceof SyntaxError ? 'El respaldo no contiene JSON válido.' : connectionError(e));
  process.exitCode=1;
} finally { if(pool) await pool.end(); }
