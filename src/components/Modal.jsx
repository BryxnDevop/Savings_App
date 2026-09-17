import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useI18n } from '../lib/i18n';

export function Modal({ title, subtitle, children, onClose, wide = false, className = '' }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const el = ref.current;
    const previous = document.activeElement;
    const page = document.getElementById('root');
    const oldHidden = page?.getAttribute('aria-hidden');
    const oldInert = page?.inert;
    const x = window.scrollX, y = window.scrollY;
    const body = document.body;
    const saved = Object.fromEntries(['overflow','position','top','left','width'].map(key => [key, body.style[key]]));
    Object.assign(body.style, { overflow:'hidden', position:'fixed', top:`-${y}px`, left:`-${x}px`, width:'100%' });
    let native = false;
    try { if (typeof el.showModal === 'function') { el.showModal(); native = true; } } catch { /* Use the accessible overlay below. */ }
    if (!native) { el.setAttribute('open',''); setFallback(true); }
    page?.setAttribute('aria-hidden','true');
    if (page) page.inert = true;
    // Focus a control, never an input, on opening: avoid opening the mobile keyboard.
    el.querySelector('.modal-close')?.focus({ preventScroll:true });
    const viewport = window.visualViewport;
    const fit = () => {
      const height = viewport?.height || window.innerHeight;
      const top = viewport?.offsetTop || 0;
      el.style.setProperty('--dialog-height', `${height}px`);
      el.style.setProperty('--dialog-top', `${top}px`);
      el.style.setProperty('--dialog-bottom', `${Math.max(0, window.innerHeight-height-top)}px`);
    };
    fit();viewport?.addEventListener('resize',fit);viewport?.addEventListener('scroll',fit);window.addEventListener('resize',fit);
    const keys = e => {
      if (native) return;
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); }
      if (e.key === 'Tab') {
        const controls = [...el.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex="0"]')].filter(node => node.tabIndex >= 0 && node.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (!first) { e.preventDefault(); el.focus(); }
        else if (e.shiftKey && (document.activeElement===first || !el.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement===last || !el.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown',keys);
    return () => {
      document.removeEventListener('keydown',keys);
      viewport?.removeEventListener('resize',fit);viewport?.removeEventListener('scroll',fit);window.removeEventListener('resize',fit);
      if (native && typeof el.close === 'function') el.close(); else el.removeAttribute('open');
      if (page) { page.inert = oldInert; if (oldHidden===null) page.removeAttribute('aria-hidden'); else page.setAttribute('aria-hidden',oldHidden); }
      Object.assign(body.style,saved);
      window.scrollTo(x,y);
      if (previous?.isConnected) previous.focus({ preventScroll:true });
    };
  }, []);
  return createPortal(<>
    {fallback && <div className="modal-fallback-backdrop" onClick={onClose} aria-hidden="true" />}
    <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''} ${className}`} data-modal-fallback={fallback || undefined} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === ref.current) { const r = ref.current.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}>
      <header className="modal-header"><div><p className="eyebrow">{t('AHORRA+ · TU ESPACIO', 'AHORRA+ · YOUR SPACE')}</p><h2 id={titleId}>{title}</h2>{subtitle && <p className="muted">{subtitle}</p>}</div><button type="button" className="icon-button modal-close" onClick={onClose} aria-label={t('Cerrar ventana','Close dialog')}><Icon name="close" /></button></header>
      {children}
    </dialog>
  </>, document.body);
}
