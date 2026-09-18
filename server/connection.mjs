import pg from 'pg';
import { readFileSync } from 'node:fs';

export function connectionOptions(connectionString, env = process.env) {
  const fail = message => { throw Object.assign(new Error(message), { code: 'DB_CONFIG' }); };
  if (!connectionString) fail('Falta DATABASE_URL. Copia la conexión Session pooler de Supabase en .env.');
  let url;
  try { url = new URL(connectionString); } catch { fail('DATABASE_URL no es una dirección válida.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || !url.password) fail('Usa la cadena de conexión de la base, no la URL de la API ni una clave anon.');
  if (/\[|\]|YOUR-PASSWORD|REEMPLAZA|PROJECT-REF|POOLER-HOST/.test(connectionString)) fail('Reemplaza los marcadores de DATABASE_URL por los datos de tu proyecto.');
  const local = ['localhost','127.0.0.1','[::1]','db'].includes(url.hostname);
  if (url.port === '6543' && !env.VERCEL) fail('Para esta app utiliza Session pooler (5432) o conexión directa; no Transaction pooler (6543).');
  // URL ssl parameters override pg's SSL object. Remove them so verification cannot be disabled.
  for (const key of [...url.searchParams.keys()]) if (key.startsWith('ssl') || key === 'uselibpqcompat') url.searchParams.delete(key);
  let ca = env.DB_SSL_CA_CERT?.replace(/\\n/g, '\n');
  if (env.DB_SSL_CA_FILE) {
    try { ca = readFileSync(env.DB_SSL_CA_FILE, 'utf8'); } catch { fail('No se pudo leer DB_SSL_CA_FILE. Revisa la ruta del certificado.'); }
  }
  return { connectionString: url.toString(), ssl: local ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) }, max: env.VERCEL ? 2 : 5, connectionTimeoutMillis: 15000, idleTimeoutMillis: env.VERCEL ? 5000 : 30000, statement_timeout: 15000 };
}
export function createPool(connectionString, env = process.env) {
  const pool = new pg.Pool(connectionOptions(connectionString, env));
  pool.on('error', () => console.error('Se perdió una conexión con la base de datos.'));
  return pool;
}
export function connectionError(error) {
  if (error.code === 'DB_CONFIG' || error.code === 'MIGRATION_REQUIRED' || error.code === 'SCHEMA_VERSION') return error.message;
  const messages = {
    '28P01': 'Contraseña de la base incorrecta. Revisa DATABASE_URL y codifica sus caracteres especiales.',
    '3D000': 'La base indicada no existe. Copia la conexión del panel Connect.',
    '42501': 'El usuario no tiene permisos. Usa la conexión del propietario postgres de tu proyecto.',
    '42P01': 'Faltan tablas. Ejecuta npx supabase db push en el proyecto vinculado.',
    ENOTFOUND: 'No se resuelve el servidor. Copia el host exacto desde Connect y comprueba internet.',
    ENETUNREACH: 'La red no llega al servidor. Prueba Session pooler para conectarte por IPv4.',
    ECONNREFUSED: 'Conexión rechazada. Comprueba que el proyecto esté activo y el puerto sea correcto.',
    SELF_SIGNED_CERT_IN_CHAIN: 'Falta el certificado de confianza. Configura DB_SSL_CA_FILE con el certificado del panel Database Settings.',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'No se verificó el certificado. Configura DB_SSL_CA_FILE; no desactives TLS.'
  };
  return messages[error.code] || 'No se pudo verificar la conexión. Comprueba internet, el proyecto, la contraseña y el certificado; consulta docs/SUPABASE.md.';
}
