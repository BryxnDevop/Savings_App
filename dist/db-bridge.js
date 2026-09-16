(() => {
  const KEY = 'ahorra_plus_v2';
  const getState = () => {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
  };
  const putState = state => fetch('./api/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state })
  }).catch(() => {});

  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    originalSetItem.call(this, key, value);
    if (this === localStorage && key === KEY) {
      try { putState(JSON.parse(value)); } catch {}
    }
  };

  window.__ahorraPlusDatabaseReady = fetch('./api/state', { headers: { Accept: 'application/json' } })
    .then(async response => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo conectar con PostgreSQL.');
      if (payload.exists && payload.state) {
        originalSetItem.call(localStorage, KEY, JSON.stringify(payload.state));
      } else {
        const local = getState();
        if (local) await putState(local);
      }
      return true;
    })
    .catch(error => {
      console.error('Ahorra+: PostgreSQL no disponible.', error);
      return false;
    });
})();
