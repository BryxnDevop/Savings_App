import { randomBytes } from 'node:crypto';
import { writeFile, readFile, appendFile } from 'node:fs/promises';
const password = randomBytes(24).toString('hex');
const encryptionKey = randomBytes(32).toString('hex');
const path = new URL('../.env', import.meta.url);
try {
  await writeFile(path, `POSTGRES_USER=ahorra\nPOSTGRES_DB=ahorra_plus\nPOSTGRES_PASSWORD=${password}\nDATABASE_URL=postgresql://ahorra:${password}@127.0.0.1:5432/ahorra_plus\nAPP_ORIGIN=http://localhost:4173\nPORT=4173\nMAIL_ENCRYPTION_KEY=${encryptionKey}\n`, { flag: 'wx', mode: 0o600 });
  console.log('Configuración creada. Ejecuta docker compose up -d --build --wait.');
} catch (e) {
  if (e.code !== 'EEXIST') throw e;
  const current = await readFile(path, 'utf8');
  const existingKey = current.match(/^MAIL_ENCRYPTION_KEY=(.*)$/m);
  if (existingKey && !existingKey[1].trim()) {
    await writeFile(path, current.replace(/^MAIL_ENCRYPTION_KEY=.*$/m, `MAIL_ENCRYPTION_KEY=${encryptionKey}`), {mode:0o600});
    console.log('Se generó la clave de cifrado de Gmail. Se conservó la configuración existente.');
  } else if (!existingKey) {
    await appendFile(path, `\nMAIL_ENCRYPTION_KEY=${encryptionKey}\n`);
    console.log('Se agregó la clave de cifrado para Gmail. Se conservó la configuración existente.');
  } else console.log('Se conserva la configuración existente.');
}
