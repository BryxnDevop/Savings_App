export const STORAGE_KEY = 'ahorra_plus_v2';
export const LEGACY_KEY = 'ahorra_plus_movements_v1';
export const MAX_CENTS = 99_999_999_999;
export const CURRENCIES = { USD: 'Dólar estadounidense', DOP: 'Peso dominicano', EUR: 'Euro', MXN: 'Peso mexicano', COP: 'Peso colombiano' };
export const CATEGORIES = {
  savings: { name: 'Ahorro', icon: 'wallet', tone: 'green' },
  salary: { name: 'Salario', icon: 'briefcase', tone: 'blue' },
  extra: { name: 'Ingreso extra', icon: 'sparkles', tone: 'purple' },
  food: { name: 'Alimentación', icon: 'basket', tone: 'orange' },
  home: { name: 'Hogar', icon: 'home', tone: 'blue' },
  transport: { name: 'Transporte', icon: 'car', tone: 'purple' },
  leisure: { name: 'Ocio', icon: 'coffee', tone: 'orange' },
  health: { name: 'Salud', icon: 'heart', tone: 'pink' },
  other: { name: 'Otros', icon: 'layers', tone: 'gray' },
};
export const emptyState = () => ({ version: 2, currency: 'USD', goal: null, movements: [] });
export const today = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '9999-12-31') return false;
  const d = new Date(`${value}T12:00:00`);
  return !Number.isNaN(d.getTime()) && today(d) === value;
}
export function parseAmount(value) {
  const text = String(value).trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('Escribe un monto positivo con un máximo de 2 decimales.');
  const [whole, decimal = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_CENTS) throw new Error('El monto debe estar entre 0.01 y 999,999,999.99.');
  return cents;
}
export function validateMovement(item, legacy = false) {
  if (!item || typeof item !== 'object') throw new Error('Hay un movimiento con formato incorrecto.');
  const { type, reason, date } = item;
  if (!['income', 'expense'].includes(type)) throw new Error('Hay un tipo de movimiento no válido.');
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 80) throw new Error('Cada movimiento debe tener un motivo de hasta 80 caracteres.');
  if (!validDate(date)) throw new Error('Hay una fecha no válida en los movimientos.');
  if (item.note != null && (typeof item.note !== 'string' || item.note.length > 180)) throw new Error('Las notas deben tener un máximo de 180 caracteres.');
  const amountCents = legacy ? parseAmount(item.amount) : item.amountCents;
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > MAX_CENTS) throw new Error('Hay un monto no válido.');
  const id = item.id;
  if (typeof id !== 'string' || !id || id.length > 150) throw new Error('Hay un identificador de movimiento no válido.');
  return { id, type, amountCents, reason: reason.trim(), date, note: (item.note || '').trim(), category: Object.hasOwn(CATEGORIES, item.category) ? item.category : type === 'income' ? 'savings' : 'other' };
}
export function validateGoal(goal) {
  if (goal == null) return null;
  if (typeof goal !== 'object' || typeof goal.name !== 'string' || !goal.name.trim() || goal.name.trim().length > 60 || !Number.isSafeInteger(goal.targetCents) || goal.targetCents <= 0 || goal.targetCents > MAX_CENTS) throw new Error('La meta de ahorro no es válida.');
  return { name: goal.name.trim(), targetCents: goal.targetCents };
}
export function validateState(data) {
  if (!data || data.version !== 2 || !Object.hasOwn(CURRENCIES, data.currency) || !Array.isArray(data.movements)) throw new Error('Este archivo no es un respaldo compatible de Ahorra+.');
  if (data.movements.length > 20000) throw new Error('El respaldo supera el límite de 20,000 movimientos.');
  const movements = data.movements.map(m => validateMovement(m));
  if (new Set(movements.map(m => m.id)).size !== movements.length) throw new Error('El respaldo contiene identificadores duplicados.');
  return { version: 2, currency: data.currency, goal: validateGoal(data.goal), movements };
}
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('No se pudo leer el JSON. Selecciona un respaldo de Ahorra+.'); }
  if (Array.isArray(data)) {
    return { ...validateState({ ...emptyState(), movements: data.map(m => validateMovement(m, true)) }), legacy: true };
  }
  return validateState(data);
}
export function mergeBackup(current, imported) {
  if (current.movements.length && !imported.legacy && current.currency !== imported.currency) throw new Error('La moneda del respaldo es distinta. No se pueden mezclar monedas sin conversión.');
  const map = new Map(current.movements.map(m => [m.id, m]));
  let added = 0, skipped = 0;
  for (const m of imported.movements) {
    if (map.has(m.id)) {
      if (JSON.stringify(map.get(m.id)) !== JSON.stringify(m)) throw new Error(`El movimiento «${m.reason}» tiene otra versión con el mismo ID. Conserva ambos respaldos y revisa el registro antes de importar.`);
      skipped++;
    } else { map.set(m.id, m); added++; }
  }
  const state = validateState({ ...current, currency: current.movements.length || imported.legacy ? current.currency : imported.currency, goal: current.goal || imported.goal, movements: [...map.values()] });
  return { state, added, skipped };
}
export function readStorage(storage) {
  try {
    const saved = storage.getItem(STORAGE_KEY);
    if (saved !== null) return { state: validateState(JSON.parse(saved)), error: null };
    const old = storage.getItem(LEGACY_KEY);
    if (old !== null) {
      const { legacy, ...state } = parseBackup(old);
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
      return { state, error: null };
    }
    return { state: emptyState(), error: null };
  } catch {
    return { state: emptyState(), error: 'No se pudieron cargar o guardar los datos de este navegador. Los datos existentes no se han sobrescrito. Exporta una copia de recuperación o importa un respaldo válido desde Ajustes.' };
  }
}
export const totals = movements => movements.reduce((acc, m) => {
  acc[m.type] += m.amountCents;
  acc.balance += m.type === 'income' ? m.amountCents : -m.amountCents;
  return acc;
}, { income: 0, expense: 0, balance: 0 });
export const money = (cents, currency = 'USD') => new Intl.NumberFormat('es-DO', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
export const dateLabel = date => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${date}T12:00:00`));
export const sortMovements = list => [...list].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
export const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function filterMovements(movements, { query = '', type = 'all', category = 'all', month = '' }) {
  const q = normalize(query.trim());
  return sortMovements(movements).filter(m => (type === 'all' || m.type === type) && (category === 'all' || m.category === category) && (!month || m.date.startsWith(month)) && normalize(`${m.reason} ${m.note} ${CATEGORIES[m.category].name}`).includes(q));
}
export function monthlySeries(movements, count = 6, now = new Date(), locale = 'es') {
  const sorted = [...movements].sort((a, b) => a.date.localeCompare(b.date));
  let cursor = 0, balance = 0;
  return Array.from({ length: count }, (_, i) => {
    const month = new Date(now.getFullYear(), now.getMonth() - count + 1 + i, 1);
    const end = today(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    let income = 0, expense = 0;
    const prefix = today(month).slice(0, 7);
    while (cursor < sorted.length && sorted[cursor].date <= end) {
      const m = sorted[cursor++];
      balance += m.type === 'income' ? m.amountCents : -m.amountCents;
      if (m.date.startsWith(prefix)) { if (m.type === 'income') income += m.amountCents; else expense += m.amountCents; }
    }
    return { key: prefix, label: month.toLocaleDateString(locale, { month: 'short' }).replace('.', ''), fullLabel: month.toLocaleDateString(locale, { month: 'long', year: 'numeric' }), balance, income, expense };
  });
}
export function csvExport(movements, currency, language = 'es') {
  const en = language === 'en';
  const names = { savings: 'Savings', salary: 'Salary', extra: 'Extra income', food: 'Food', home: 'Home', transport: 'Transport', leisure: 'Leisure', health: 'Health', other: 'Other' };
  const quote = value => '"' + String(value).replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""') + '"';
  return '\ufeff' + [en ? ['Date','Type','Description','Category','Amount','Currency','Note'] : ['Fecha', 'Tipo', 'Motivo', 'Categoría', 'Monto', 'Moneda', 'Nota'], ...sortMovements(movements).map(m => [m.date, m.type === 'income' ? (en ? 'Income' : 'Entrada') : (en ? 'Expense' : 'Salida'), m.reason, en ? names[m.category] : CATEGORIES[m.category].name, (m.amountCents / 100).toFixed(2), currency, m.note])].map(row => row.map(quote).join(',')).join('\r\n');
}
export function demoState(now = new Date(), language = 'es') {
  const entries = [
    [-5, 3, 'income', 120000, 'Un comienzo para mi ahorro', 'savings'],
    [-4, 3, 'income', 85000, 'Ahorro del mes', 'savings'],
    [-4, 12, 'expense', 18000, 'Una escapada de fin de semana', 'leisure'],
    [-3, 2, 'income', 110000, 'Ahorro del salario', 'salary'],
    [-3, 18, 'expense', 26000, 'Compra para el hogar', 'home'],
    [-2, 3, 'income', 95000, 'Ahorro del mes', 'savings'],
    [-2, 22, 'expense', 30000, 'Cuidado personal', 'health'],
    [-1, 2, 'income', 115000, 'Ahorro del salario', 'salary'],
    [-1, 20, 'expense', 26000, 'Mantenimiento del auto', 'transport'],
    [0, 1, 'income', 85000, 'Ahorro del salario', 'salary'],
    [0, 3, 'income', 25000, 'Proyecto freelance', 'extra'],
    [0, 5, 'expense', 12750, 'Compra del supermercado', 'food'],
    [0, 8, 'expense', 3825, 'Café con amigos', 'leisure'],
  ];
  if (language === 'en') {
    const translated = ['A start to my savings','Monthly savings','A weekend getaway','Savings from salary','Home purchase','Monthly savings','Personal care','Savings from salary','Car maintenance','Savings from salary','Freelance project','Grocery shopping','Coffee with friends'];
    entries.forEach((entry,i) => { entry[4] = translated[i]; });
  }
  return { version: 2, currency: 'USD', goal: { name: language === 'en' ? 'My peace-of-mind fund' : 'Mi fondo de tranquilidad', targetCents: 750000 }, movements: entries.map(([offset, day, type, amountCents, reason, category], i) => ({ id: `demo-${i}`, date: today(new Date(now.getFullYear(), now.getMonth() + offset, offset === 0 ? Math.min(day, now.getDate()) : day)), type, amountCents, reason, category, note: '' })) };
}
