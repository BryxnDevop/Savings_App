import { useEffect, useRef, useState } from 'react';

export function usePwa() {
  const [online, setOnline] = useState(navigator.onLine);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [prompt, setPrompt] = useState(null);
  const [update, setUpdate] = useState(null);
  const [installed, setInstalled] = useState(window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);
  const registrationRef = useRef(null);
  const refreshing = useRef(false);
  useEffect(() => {
    let alive = true;
    const connection = () => { setOnline(navigator.onLine); if (navigator.onLine) registrationRef.current?.update().catch(() => {}); };
    const beforeInstall = e => { e.preventDefault(); setPrompt(e); };
    const appInstalled = () => { setInstalled(true); setPrompt(null); };
    const controllerChange = () => {
      setReady(true);
      if (refreshing.current) window.location.reload();
    };
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', appInstalled);
    const sw = navigator.serviceWorker;
    sw?.addEventListener('controllerchange', controllerChange);
    if (import.meta.env.PROD && sw && window.isSecureContext) {
      sw.register('./sw.js', { scope: './', updateViaCache: 'none' }).then(reg => {
        if (!alive) return;
        registrationRef.current = reg;
        if (reg.active) setReady(true);
        if (reg.waiting) setUpdate(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          worker?.addEventListener('statechange', () => {
            if (!alive) return;
            if (worker.state === 'installed' && sw.controller) setUpdate(worker);
            if (worker.state === 'activated') setReady(true);
          });
        });
        sw.ready.then(() => { if (alive) setReady(true); });
        reg.update().catch(() => {});
      }).catch(() => { if (alive) setError('No se pudo preparar el acceso sin conexión. Comprueba la conexión y vuelve a abrir la app.'); });
    }
    return () => {
      alive = false;
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', appInstalled);
      sw?.removeEventListener('controllerchange', controllerChange);
    };
  }, []);
  async function install() {
    if (!prompt) return false;
    try { await prompt.prompt(); const result = await prompt.userChoice; setPrompt(null); return result.outcome === 'accepted'; }
    catch { setPrompt(null); return false; }
  }
  function applyUpdate() { refreshing.current = true; update?.postMessage({ type: 'SKIP_WAITING' }); }
  return { online, ready, error, canInstall: !!prompt, installed, install, update: !!update, applyUpdate, development: import.meta.env.DEV };
}
