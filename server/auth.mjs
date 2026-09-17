import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const fail = (code, status = 400) => Object.assign(new Error(code), { status });
export const emailAddress = value => {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw fail('INVALID_EMAIL');
  return value.trim().toLowerCase();
};
export function validPassword(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) throw fail('PASSWORD_LENGTH');
  return password;
}
export async function hashPassword(password) {
  validPassword(password);
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64, options);
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [, salt, digest] = (encoded || '').split(':');
  const candidate = await scrypt(password, salt || '00000000000000000000000000000000', 64, options);
  if (!digest) return false;
  const expected = Buffer.from(digest, 'hex');
  return expected.length === candidate.length && timingSafeEqual(candidate, expected);
}
export const tokenHash = token => createHash('sha256').update(token).digest('hex');
export const cookieToken = req => (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('ahorra_session='))?.slice(15) || '';
export function cookie(token, secure, clear = false) {
  return `ahorra_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : 2592000}${secure ? '; Secure' : ''}`;
}
export async function createSession(client, userId) {
  const token = randomBytes(32).toString('hex');
  await client.query('DELETE FROM ahorra.ahorra_sessions WHERE expires_at <= now()');
  await client.query("INSERT INTO ahorra.ahorra_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')", [tokenHash(token), userId]);
  return token;
}
export async function authenticate(pool, req) {
  const token = cookieToken(req);
  if (!/^[a-f0-9]{64}$/.test(token)) throw fail('UNAUTHORIZED', 401);
  const { rows: [user] } = await pool.query('SELECT u.id,u.email,u.name,u.language,u.avatar FROM ahorra.ahorra_sessions s JOIN ahorra.ahorra_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()', [tokenHash(token)]);
  if (!user) throw fail('UNAUTHORIZED', 401);
  return user;
}
export function profileFields(input) {
  const fields = {};
  if (Object.hasOwn(input, 'name')) {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 80) throw fail('INVALID_NAME');
    fields.name = input.name.trim();
  }
  if (Object.hasOwn(input, 'language')) {
    if (!['es', 'en'].includes(input.language)) throw fail('INVALID_LANGUAGE');
    fields.language = input.language;
  }
  if (Object.hasOwn(input, 'avatar')) {
    if (typeof input.avatar !== 'string' || input.avatar.length > 400000) throw fail('INVALID_AVATAR');
    if (input.avatar) {
      const match = input.avatar.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
      if (!match) throw fail('INVALID_AVATAR');
      const bytes = Buffer.from(match[2], 'base64');
      const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const webp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
      if (!({ png, jpeg, webp })[match[1]]) throw fail('INVALID_AVATAR');
    }
    fields.avatar = input.avatar;
  }
  return fields;
}
