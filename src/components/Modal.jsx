import { useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { useI18n } from '../lib/i18n';

export function Modal({ title, subtitle, children, onClose, wide = false, className = '' }) {
  const { t } = useI18n();
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    el.showModal();
    return () => { el.close(); document.body.style.overflow = oldOverflow; previous?.focus(); };
  }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''} ${className}`} aria-labelledby="modal-title" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === ref.current) { const r = ref.current.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose(); } }}>
    <header className="modal-header"><div><p className="eyebrow">{t('AHORRA+ · TU ESPACIO', 'AHORRA+ · YOUR SPACE')}</p><h2 id="modal-title">{title}</h2>{subtitle && <p className="muted">{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label={t('Cerrar ventana','Close dialog')}><Icon name="close" /></button></header>
    {children}
  </dialog>;
}
