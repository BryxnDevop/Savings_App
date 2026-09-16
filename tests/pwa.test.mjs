import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('El manifiesto incluye iconos reales y arranque instalable en subcarpetas', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url)));
  assert.equal(manifest.display, 'standalone'); assert.equal(manifest.start_url, './'); assert.equal(manifest.scope, './');
  for (const size of ['192x192', '512x512']) assert.ok(manifest.icons.some(i => i.sizes === size));
  for (const icon of manifest.icons) assert.ok((await stat(new URL('../public/' + icon.src, import.meta.url))).size > 100);
});
test('Service worker: precaché, recarga sin red, recursos estáticos, aislamiento y actualización', async () => {
  const source = await readFile(new URL('../scripts/sw-template.js', import.meta.url), 'utf8');
  const events = {}, map = new Map(), stores = new Map();
  const scope = 'https://example.test/ahorra/';
  const prefix = 'ahorra-plus-' + encodeURIComponent(scope) + '-';
  stores.set(prefix + 'old', new Map()); stores.set('otra-app', new Map());
  let skipped = false, claimed = false;
  const fakeCaches = {
    keys: async () => [...stores.keys()],
    delete: async key => stores.delete(key),
    open: async key => {
      if (!stores.has(key)) stores.set(key, map);
      const current = stores.get(key);
      return {
        addAll: async urls => { for (const url of urls) current.set(url, new Response(url.endsWith('index.html') ? '<main>Ahorra+</main>' : 'asset')); },
        match: async request => { const url = new URL(typeof request === 'string' ? request : request.url); url.search = ''; return current.get(url.href)?.clone(); },
      };
    },
  };
  runInNewContext(source.replace('__BUILD_VERSION__', 'test').replace('__PRECACHE_URLS__', JSON.stringify(['./index.html', './assets/app.js'])), {
    caches: fakeCaches, URL, Response, fetch: async () => { throw new Error('offline'); },
    self: { registration: { scope }, location: { origin: 'https://example.test' }, clients: { claim: async () => { claimed = true; } }, skipWaiting: () => { skipped = true; }, addEventListener: (name, fn) => { events[name] = fn; } },
  });
  let operation;
  events.install({ waitUntil: p => { operation = p; } }); await operation;
  events.activate({ waitUntil: p => { operation = p; } }); await operation;
  assert.ok(claimed); assert.ok(!stores.has(prefix + 'old')); assert.ok(stores.has('otra-app'));
  async function request(url, mode = 'navigate', method = 'GET') {
    let result;
    events.fetch({ request: { url, mode, method }, respondWith: promise => { result = promise; } });
    return result;
  }
  assert.equal(await (await request(scope)).text(), '<main>Ahorra+</main>');
  assert.equal(await (await request(scope + 'assets/app.js', 'cors')).text(), 'asset');
  assert.equal((await request(scope + 'missing.js', 'cors')).status, 503);
  assert.equal(await request('https://other.test/'), undefined);
  assert.equal(await request('https://example.test/other/'), undefined);
  assert.equal(await request(scope, 'cors', 'POST'), undefined);
  assert.equal(await request('https://example.test/api/state', 'cors'), undefined);
  assert.equal(await request('https://example.test/api/auth/me', 'navigate'), undefined);
  events.message({ data: { type: 'SKIP_WAITING' } }); assert.ok(skipped);
});
