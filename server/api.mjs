import { createMailService } from './mail.mjs';
import { randomUUID } from 'node:crypto';
import { newWallet, readWallet, writeWallet } from './db.mjs';
import { authenticate, hashPassword, verifyPassword, emailAddress, createSession, cookieToken, cookie, tokenHash, profileFields, fail } from './auth.mjs';
import { validateRates } from '../src/lib/ledger.js';

export const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(JSON.stringify(body));
};
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw fail('JSON_REQUIRED', 415);
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 10 * 1024 * 1024) throw fail('FILE_TOO_LARGE', 413);
    chunks.push(chunk);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail('INVALID_JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail('INVALID_JSON');
  return value;
}
export function createApi(pool, { origins, rateFetch = fetch, mailService }) {
  const mail = mailService || createMailService(pool);
  const allowed = new Set(origins);
  const hosts = new Set(origins.map(o => new URL(o).host));
  const secure = new URL(origins[0]).protocol === 'https:';
  const attempts = new Map();
  function rateLimit(req) {
    const key = req.socket.remoteAddress;
    const now = Date.now();
    const item = attempts.get(key);
    if (!item || item.until < now) attempts.set(key, { count: 1, until: now + 600000 });
    else if (++item.count > 30) throw fail('TOO_MANY_ATTEMPTS', 429);
    if (attempts.size > 10000) attempts.delete(attempts.keys().next().value);
  }
  return async (req, res) => {
    const path = new URL(req.url, origins[0]).pathname;
    if (!path.startsWith('/api/')) return false;
    try {
      if (!hosts.has(req.headers.host) || (req.headers.origin && !allowed.has(req.headers.origin))) throw fail('FORBIDDEN_ORIGIN', 403);
      if (req.headers['sec-fetch-site'] === 'cross-site') throw fail('FORBIDDEN_ORIGIN', 403);
      if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-ahorra-request'] !== '1') throw fail('FORBIDDEN_ORIGIN', 403);
      if (path === '/api/health' && req.method === 'GET') {
        await pool.query('SELECT 1'); send(res, 200, { ok: true, storage: 'postgresql' }); return true;
      }
      if (path === '/api/auth/register' && req.method === 'POST') {
        rateLimit(req);
        const input = await body(req);
        const email = emailAddress(input.email);
        const profile = profileFields({ name: input.name, language: input.language || 'es' });
        const hash = await hashPassword(input.password);
        const id = randomUUID(); const client = await pool.connect(); let token;
        try {
          await client.query('BEGIN');
          await client.query('INSERT INTO ahorra_users(id,email,password_hash,name,language) VALUES($1,$2,$3,$4,$5)', [id, email, hash, profile.name, profile.language]);
          await newWallet(client, id);
          token = await createSession(client, id);
          await client.query('COMMIT');
        } catch (e) { await client.query('ROLLBACK'); if (e.code === '23505') throw fail('ACCOUNT_EXISTS', 409); throw e; }
        finally { client.release(); }
        send(res, 201, { user: { id, email, name: profile.name, language: profile.language, avatar: '' } }, { 'Set-Cookie': cookie(token, secure) }); return true;
      }
      if (path === '/api/auth/login' && req.method === 'POST') {
        rateLimit(req);
        const input = await body(req); const email = emailAddress(input.email);
        const { rows: [user] } = await pool.query('SELECT * FROM ahorra_users WHERE email=$1', [email]);
        if (!(await verifyPassword(input.password, user?.password_hash))) throw fail('INVALID_CREDENTIALS', 401);
        const token = await createSession(pool, user.id);
        const { password_hash, created_at, ...profile } = user;
        send(res, 200, { user: profile }, { 'Set-Cookie': cookie(token, secure) }); return true;
      }
      if (path === '/api/auth/logout' && req.method === 'POST') {
        await pool.query('DELETE FROM ahorra_sessions WHERE token_hash=$1', [tokenHash(cookieToken(req))]);
        send(res, 200, { ok: true }, { 'Set-Cookie': cookie('', secure, true) }); return true;
      }
      const user = await authenticate(pool, req);
      if (path === '/api/mail' && req.method === 'GET') { send(res,200,await mail.status(user.id));return true; }
      if (path === '/api/mail/connect' && req.method === 'POST') { rateLimit(req);send(res,200,await mail.connect(user.id,await body(req)));return true; }
      if (path === '/api/mail/settings' && req.method === 'PUT') { send(res,200,await mail.settings(user.id,await body(req)));return true; }
      if (path === '/api/mail/disconnect' && req.method === 'POST') { send(res,200,await mail.disconnect(user.id));return true; }
      if (path === '/api/mail/check' && req.method === 'POST') { send(res,202,await mail.check(user.id));return true; }
      if (path === '/api/mail/preview' && req.method === 'POST') { send(res,200,mail.preview(await body(req)));return true; }
      if (path === '/api/mail/review' && req.method === 'POST') { const input=await body(req);send(res,200,await mail.review(user.id,input.id,input.action));return true; }
      if (path === '/api/auth/me' && req.method === 'GET') { send(res, 200, { user }); return true; }
      if (path === '/api/profile' && req.method === 'PATCH') {
        const fields = profileFields(await body(req));
        const { rows: [updated] } = await pool.query('UPDATE ahorra_users SET name=COALESCE($2,name),language=COALESCE($3,language),avatar=COALESCE($4,avatar) WHERE id=$1 RETURNING id,email,name,language,avatar', [user.id, fields.name ?? null, fields.language ?? null, fields.avatar ?? null]);
        send(res, 200, { user: updated }); return true;
      }
      if (path === '/api/auth/password' && req.method === 'POST') {
        rateLimit(req);
        const input = await body(req); const next = await hashPassword(input.password);
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const { rows: [row] } = await client.query('SELECT password_hash FROM ahorra_users WHERE id=$1 FOR UPDATE', [user.id]);
          if (!(await verifyPassword(input.currentPassword, row.password_hash))) throw fail('INVALID_CREDENTIALS', 401);
          await client.query('UPDATE ahorra_users SET password_hash=$2 WHERE id=$1', [user.id, next]);
          await client.query('DELETE FROM ahorra_sessions WHERE user_id=$1 AND token_hash<>$2', [user.id, tokenHash(cookieToken(req))]);
          await client.query('COMMIT');
        } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
        send(res, 200, { ok: true }); return true;
      }
      if (path === '/api/state' && req.method === 'GET') { send(res, 200, await readWallet(pool, user.id)); return true; }
      if (path === '/api/state' && req.method === 'PUT') { send(res, 200, await writeWallet(pool, user.id, await body(req))); return true; }
      if (path === '/api/rates' && req.method === 'GET') {
        const { rows: [cached] } = await pool.query("SELECT payload FROM ahorra_rate_cache WHERE id=1 AND fetched_at>now()-interval '1 hour'");
        if (cached) { send(res, 200, cached.payload); return true; }
        let quote;
        try {
          const upstream = await rateFetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(7000) });
          const raw = await upstream.json();
          if (!upstream.ok || raw.result !== 'success' || raw.base_code !== 'USD' || !Number.isFinite(raw.time_last_update_unix)) throw new Error();
          quote = { rates: validateRates(raw.rates), rateInfo: { source: 'ExchangeRate-API', date: new Date(raw.time_last_update_unix * 1000).toISOString() } };
          await pool.query('INSERT INTO ahorra_rate_cache(id,payload) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,fetched_at=now()', [JSON.stringify(quote)]);
        } catch { throw fail('RATES_UNAVAILABLE', 503); }
        send(res, 200, quote); return true;
      }
      throw fail('NOT_FOUND', 404);
    } catch (e) {
      const status = e.status || 503;
      const code = e.status ? e.message : 'DATABASE_UNAVAILABLE';
      if (!e.status) console.error('Error de servicio:', e.code || 'DB_OR_SERVER');
      if (!res.headersSent && !res.destroyed) send(res, status, { error: code });
      return true;
    }
  };
}
