import { useState } from 'react';
import { useI18n, categoryName } from '../lib/i18n';
import { CURRENCIES, CATEGORIES, parseAmount, today, uid, validateMovement } from '../lib/finance';
import { Icon } from './Icon';
export function EntryForm({ movement, currency, onSave, onClose, busy }) {
  const { t, error } = useI18n();
  const [type, setType] = useState(movement?.type || 'income');
  const [message, setMessage] = useState('');
  async function submit(e) {
    e.preventDefault(); if (busy) return;
    const f = Object.fromEntries(new FormData(e.target));
    try {
      if (f.date > today()) throw new Error('INVALID_LEDGER');
      const next = { ...validateMovement({ id: movement?.id || uid(), type, amountCents: parseAmount(f.amount), reason: f.reason, date: f.date, note: f.note, category: f.category }), currency: f.currency };
      const message = await onSave(next); if (message) setMessage(message);
    } catch(e) { setMessage(error(e)); }
  }
  return <form className="form" onSubmit={submit}><fieldset className="type-picker" disabled={busy}><legend className="sr-only">{t('Tipo de movimiento','Movement type')}</legend>{[['income',t('Guardé dinero','Money in'),'up'],['expense',t('Retiré dinero','Money out'),'down']].map(([value,label,icon]) => <label className={type === value ? `selected ${value}` : ''} key={value}><input type="radio" name="type" value={value} checked={type === value} onChange={() => setType(value)} /><Icon name={icon} />{label}</label>)}</fieldset>
    <div className="form-grid"><label>{t('Monto original','Original amount')}<input autoFocus name="amount" inputMode="decimal" required maxLength={16} placeholder="0.00" defaultValue={movement ? (movement.amountCents / 100).toFixed(2) : ''} /></label><label>{t('Moneda original','Original currency')}<select name="currency" defaultValue={movement?.currency || currency}>{Object.keys(CURRENCIES).map(code => <option key={code}>{code}</option>)}</select></label></div>
    <label>{t('Motivo','Description')}<input name="reason" required maxLength={80} defaultValue={movement?.reason || ''} placeholder={t('Ej. Ahorro del salario','e.g. Savings from salary')} /></label>
    <div className="form-grid"><label>{t('Categoría','Category')}<select name="category" defaultValue={movement?.category || 'savings'}>{Object.keys(CATEGORIES).map(key => <option value={key} key={key}>{categoryName(key,t)}</option>)}</select></label><label>{t('Fecha','Date')}<input name="date" type="date" required min="1900-01-01" max={today()} defaultValue={movement?.date || today()} /></label></div>
    <label>{t('Nota (opcional)','Note (optional)')}<textarea name="note" maxLength={180} defaultValue={movement?.note || ''} /></label>
    {message && <p className="form-error" role="alert">{message}</p>}
    <div className="modal-actions"><button className="button secondary" type="button" disabled={busy} onClick={onClose}>{t('Cancelar','Cancel')}</button><button className="button primary" disabled={busy}>{busy ? t('Guardando…','Saving…') : t('Guardar movimiento','Save movement')}</button></div></form>;
}
