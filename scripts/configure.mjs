import { randomBytes } from 'node:crypto';
import { writeFile, readFile, appendFile } from 'node:fs/promises';
const encryptionKey = randomBytes(32).toString('hex');
const path = new URL('../.env', import.meta.url);
try {
  const template = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  await writeFile(path, template.replace(/^MAIL_ENCRYPTION_KEY=.*$/m, `MAIL_ENCRYPTION_KEY=${encryptionKey}`), { flag: 'wx', mode: 0o600 });
  console.log('Se creó .env. Configura DATABASE_URL con Session pooler de Supabase; consulta docs/SUPABASE.md.');
} catch (e) {
  if (e.code !== 'EEXIST') throw e;
  const current = await readFile(path, 'utf8');
  const existingKey = current.match(/^MAIL_ENCRYPTION_KEY=(.*)$/m);
  if (existingKey && !existingKey[1].trim()) {
    await writeFile(path, current.replace(/^MAIL_ENCRYPTION_KEY=.*$/m, `MAIL_ENCRYPTION_KEY=${encryptionKey}`), {mode:0o600});
    console.log('Se generó la clave de cifrado de Gmail. Se conservó el resto de la configuración.');
  } else if (!existingKey) {
    await appendFile(path, `\nMAIL_ENCRYPTION_KEY=${encryptionKey}\n`);
    console.log('Se agregó la clave de cifrado para Gmail. Se conservó la configuración existente.');
  } else console.log('Se conserva .env y tu clave de cifrado. Revisa DATABASE_URL: debe apuntar a Supabase.');
}
