import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) paths.push(...await walk(path));
    else if (entry.name !== 'sw.js') paths.push(path);
  }
  return paths;
}
const files = (await walk(root)).sort();
const template = await readFile(new URL('./sw-template.js', import.meta.url), 'utf8');
const hash = createHash('sha256').update(template);
for (const file of files) hash.update(relative(root, file)).update(await readFile(file));
const version = hash.digest('hex').slice(0, 16);
const paths = files.map(file => './' + relative(root, file).replaceAll('\\', '/'));
if (!paths.includes('./index.html') || !paths.includes('./manifest.webmanifest')) throw new Error('Falta la página principal o el manifiesto PWA.');
const worker = template.replace('__BUILD_VERSION__', version).replace('__PRECACHE_URLS__', JSON.stringify(paths));
await writeFile(resolve(root, 'sw.js'), worker);
console.log(`PWA lista: ${paths.length} recursos locales, versión ${version}.`);
