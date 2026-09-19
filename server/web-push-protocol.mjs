import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign } from 'node:crypto';

const b64u = value => Buffer.from(value).toString('base64url');
const fromB64u = value => Buffer.from(value, 'base64url');
const extract = (salt, ikm) => createHmac('sha256', salt).update(ikm).digest();
function expand(prk, info, length) {
  const parts = []; let previous = Buffer.alloc(0); let counter = 1;
  while (Buffer.concat(parts).length < length) {
    previous = createHmac('sha256', prk).update(Buffer.concat([previous, info, Buffer.from([counter++])])).digest();
    parts.push(previous);
  }
  return Buffer.concat(parts).subarray(0, length);
}
function vapidPrivateKey(publicKey, privateKey) {
  const pub = fromB64u(publicKey); const d = fromB64u(privateKey);
  if (pub.length !== 65 || pub[0] !== 4 || d.length !== 32) throw Object.assign(new Error('VAPID_KEY_INVALID'), { code: 'PUSH_CONFIG' });
  return createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)), d: b64u(d) } });
}
function vapidToken(endpoint, { publicKey, privateKey, subject }, now = Date.now()) {
  const audience = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 60 * 60, sub: subject }));
  const unsigned = `${header}.${claims}`;
  const signature = sign('sha256', Buffer.from(unsigned), { key: vapidPrivateKey(publicKey, privateKey), dsaEncoding: 'ieee-p1363' });
  return `${unsigned}.${b64u(signature)}`;
}
function encryptPayload(subscription, payload) {
  const clientPublic = fromB64u(subscription.keys.p256dh);
  const auth = fromB64u(subscription.keys.auth);
  if (clientPublic.length !== 65 || clientPublic[0] !== 4 || auth.length < 16) throw Object.assign(new Error('PUSH_SUBSCRIPTION_INVALID'), { code: 'PUSH_SUBSCRIPTION_INVALID' });
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
  const serverPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(clientPublic);
  const prkKey = extract(auth, shared);
  const ikm = expand(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), clientPublic, serverPublic]), 32);
  const salt = randomBytes(16);
  const prk = extract(salt, ikm);
  const cek = expand(prk, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = expand(prk, Buffer.from('Content-Encoding: nonce\0'), 12);
  const plain = Buffer.concat([Buffer.from(payload), Buffer.from([2])]);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([serverPublic.length]), serverPublic, encrypted]);
}
export function generateVapidKeys() {
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}
export function validateVapid(config) {
  if (!config?.publicKey || !config?.privateKey || !config?.subject) return false;
  try {
    const subject = new URL(config.subject.startsWith('mailto:') ? config.subject : config.subject);
    if (!['mailto:', 'https:'].includes(subject.protocol)) return false;
    vapidPrivateKey(config.publicKey, config.privateKey);
    return true;
  } catch { return false; }
}
export async function sendWebPush(subscription, payload, vapid, { ttl = 86400, urgency = 'normal', fetchImpl = fetch } = {}) {
  const body = encryptPayload(subscription, Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)));
  const response = await fetchImpl(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${vapidToken(subscription.endpoint, vapid)}, k=${vapid.publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: urgency,
    },
    body,
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const error = Object.assign(new Error(`PUSH_${response.status}`), { code: 'PUSH_DELIVERY', statusCode: response.status });
    throw error;
  }
  return { statusCode: response.status };
}
