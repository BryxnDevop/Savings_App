export async function api(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch('/api' + path, { method, credentials: 'same-origin', cache: 'no-store', headers: { 'X-Ahorra-Request': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(path === '/mail/connect' ? 45000 : 20000) });
  } catch { throw Object.assign(new Error('NETWORK_ERROR'), { code: 'NETWORK_ERROR' }); }
  let payload;
  try { payload = await response.json(); } catch { throw Object.assign(new Error('NETWORK_ERROR'), { code: 'NETWORK_ERROR' }); }
  if (!response.ok) throw Object.assign(new Error(payload.error || 'NETWORK_ERROR'), { code: payload.error, status: response.status });
  return payload;
}
