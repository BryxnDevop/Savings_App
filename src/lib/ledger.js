import { CURRENCIES, emptyState, validateState, parseBackup, sortMovements, totals } from './finance.js';

// Reference examples, not live quotes. Users can edit these or load dated rates.
export const DEFAULT_RATES = { USD: 1, DOP: 59.1, EUR: 0.92, MXN: 18.5, COP: 4000 };
export const emptyLedger = () => ({ ...emptyState(), version: 3, rates: { ...DEFAULT_RATES }, rateInfo: { source: 'manual', date: null }, movements: [] });
export function validateRates(rates) {
  const result = {};
  for (const code of Object.keys(CURRENCIES)) {
    const n = rates?.[code];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0.000001 || n > 1000000) throw new Error('INVALID_RATES');
    result[code] = Math.round(n * 1e6) / 1e6;
  }
  if (result.USD !== 1) throw new Error('INVALID_RATES');
  return result;
}
export function convertCents(amount, from, to, rates) {
  if (from === to) return amount;
  const source = BigInt(Math.round(rates[from] * 1e6));
  const target = BigInt(Math.round(rates[to] * 1e6));
  if (source <= 0n || target <= 0n) throw new Error('INVALID_RATES');
  const converted = (BigInt(amount) * target + source / 2n) / source;
  if (converted > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('AMOUNT_TOO_LARGE');
  return Number(converted);
}
export function validateLedger(input) {
  if (!input || input.version !== 3) throw new Error('INVALID_BACKUP');
  const plain = validateState({ ...input, version: 2 });
  const rates = validateRates(input.rates);
  const movements = plain.movements.map((m, i) => {
    const currency = input.movements[i].currency;
    if (!Object.hasOwn(CURRENCIES, currency)) throw new Error('INVALID_CURRENCY');
    return { ...m, currency };
  });
  let goal = null;
  if (plain.goal) {
    if (!Object.hasOwn(CURRENCIES, input.goal.currency)) throw new Error('INVALID_CURRENCY');
    goal = { ...plain.goal, currency: input.goal.currency };
  }
  const info = input.rateInfo;
  if (!info || !['manual', 'ExchangeRate-API'].includes(info.source) || (info.date !== null && (typeof info.date !== 'string' || !Number.isFinite(Date.parse(info.date))))) throw new Error('INVALID_RATES');
  const result = { ...plain, version: 3, rates, rateInfo: { source: info.source, date: info.date }, movements, goal };
  const view = displayLedger(result);
  const sum = totals(view.movements);
  if (!Number.isSafeInteger(sum.income) || !Number.isSafeInteger(sum.expense)) throw new Error('AMOUNT_TOO_LARGE');
  return result;
}
export function displayLedger(ledger) {
  const balance = ledger.movements.reduce((n,m) => n + (m.type === 'income' ? 1 : -1) * m.amountCents * ledger.rates[ledger.currency] / ledger.rates[m.currency], 0);
  const progressPercent = ledger.goal ? Math.max(0, Math.min(100, balance / (ledger.goal.targetCents * ledger.rates[ledger.currency] / ledger.rates[ledger.goal.currency]) * 100)) : 0;
  return { ...ledger, movements: ledger.movements.map(m => ({ ...m, amountCents: convertCents(m.amountCents, m.currency, ledger.currency, ledger.rates) })), goal: ledger.goal ? { ...ledger.goal, progressPercent, targetCents: convertCents(ledger.goal.targetCents, ledger.goal.currency, ledger.currency, ledger.rates) } : null };
}
export function readBackup(text, legacyCurrency = 'USD') {
  let raw;
  try { raw = JSON.parse(text); } catch { throw new Error('INVALID_BACKUP'); }
  if (raw?.version === 3) return validateLedger(raw);
  const old = parseBackup(text);
  const currency = old.legacy ? legacyCurrency : old.currency;
  return validateLedger({ ...emptyLedger(), currency, movements: old.movements.map(m => ({ ...m, currency })), goal: old.goal ? { ...old.goal, currency } : null });
}
export function mergeLedger(current, imported) {
  const map = new Map(current.movements.map(m => [m.id, m]));
  let added = 0, skipped = 0;
  for (const m of imported.movements) {
    if (map.has(m.id)) {
      if (JSON.stringify(map.get(m.id)) !== JSON.stringify(m)) throw new Error('IMPORT_CONFLICT');
      skipped++;
    } else { map.set(m.id, m); added++; }
  }
  const base = current.movements.length || current.goal ? current : { ...current, currency: imported.currency, rates: imported.rates, rateInfo: imported.rateInfo };
  return { ledger: validateLedger({ ...base, movements: [...map.values()], goal: current.goal || imported.goal }), added, skipped };
}
export function fortnightGroups(movements, month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('INVALID_MONTH');
  const rows = sortMovements(movements).filter(m => m.date.startsWith(month + '-'));
  const [year, number] = month.split('-').map(Number);
  const end = new Date(year, number, 0).getDate();
  return [[1, 15], [16, end]].map(([from, to]) => {
    const items = rows.filter(m => Number(m.date.slice(-2)) >= from && Number(m.date.slice(-2)) <= to);
    return { from, to, items, ...totals(items) };
  });
}
