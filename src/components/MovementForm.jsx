import { useState } from 'react';
import { CATEGORIES, parseAmount, today, uid, validateMovement } from '../lib/finance';
import { Icon } from './Icon';

export function MovementForm({ movement, currency, onSave, onClose }) {
  const [type, setType] = useState(movement?.type || 'income');
  const [amount, setAmount] = useState(movement ? (movement.amountCents / 100).toFixed(2) : '');
  const [reason, setReason] = useState(movement?.reason || '');
  const [date, setDate] = useState(movement?.date || today());
  const [category, setCategory] = useState(movement?.category || 'savings');
  const [note, setNote] = useState(movement?.note || '');
  const [error, setError] = useState('');
  function submit(e) {
    e.preventDefault();
    try {
      if (date > today()) throw new Error('Registra una fecha de hoy o anterior.');
      const next = validateMovement({ id: movement?.id || uid(), type, amountCents: parseAmount(amount), reason, date, category, note });
      const message = onSave(next);
      if (message) setError(message);
    } catch (e) { setError(e.message); }
  }
  return <form onSubmit={submit} className="form">
    <fieldset className="type-picker"><legend className="sr-only">Tipo de movimiento</legend>{[['income', 'Guardé dinero', 'up'], ['expense', 'Retiré dinero', 'down']].map(([value, label, icon]) => <label key={value} className={type === value ? `selected ${value}` : ''}><input type="radio" name="type" value={value} checked={type === value} onChange={() => { setType(value); if (!movement) setCategory(value === 'income' ? 'savings' : 'other'); }} /><Icon name={icon} />{label}</label>)}</fieldset>
    <label className="amount-label" htmlFor="amount">Monto <span>{currency}</span></label>
    <input className="amount-input" autoFocus id="amount" inputMode="decimal" autoComplete="off" placeholder="0.00" maxLength={16} required value={amount} onChange={e => setAmount(e.target.value)} aria-describedby={error ? 'form-error' : undefined} />
    <label>Motivo<input required maxLength={80} placeholder="Ej. Ahorro del salario" value={reason} onChange={e => setReason(e.target.value)} /></label>
    <div className="form-grid"><label>Categoría<select value={category} onChange={e => setCategory(e.target.value)}>{Object.entries(CATEGORIES).map(([key, c]) => <option value={key} key={key}>{c.name}</option>)}</select></label><label>Fecha<input type="date" min="1900-01-01" max={today()} required value={date} onChange={e => setDate(e.target.value)} /></label></div>
    <label>Nota <span className="optional">opcional</span><textarea maxLength={180} placeholder="Un detalle para recordar…" value={note} onChange={e => setNote(e.target.value)} /></label>
    {error && <p className="form-error" id="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" type="submit"><Icon name="check" />{movement ? 'Guardar cambios' : 'Guardar movimiento'}</button></div>
  </form>;
}
