import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, totals, monthlySeries, validateMovement, validateState, validDate, today, parseBackup, mergeBackup, emptyState, readStorage, STORAGE_KEY, LEGACY_KEY, filterMovements, csvExport } from '../src/lib/finance.js';

const movement = overrides => ({ id: 'one', type: 'income', amountCents: 10000, reason: 'Ahorro', date: '2026-09-15', note: '', category: 'savings', ...overrides });
test('Importes decimales exactos, con punto o coma; rechaza negativos y más de 2 decimales', () => {
  assert.equal(parseAmount('0.29'), 29);
  assert.equal(parseAmount('1,05'), 105);
  assert.equal(parseAmount('999999999.99'), 99999999999);
  for (const value of ['0', '-1', '1.234', 'Infinity', 'NaN', '1e3', '', '1000000000', '1,000.00']) assert.throws(() => parseAmount(value));
  assert.equal(totals([movement({ amountCents: parseAmount('0.1') }), movement({ id: 'two', amountCents: parseAmount('0.2') })]).balance, 30);
});
test('El saldo y los retiros se calculan en centavos, incluido saldo negativo', () => {
  assert.deepEqual(totals([movement(), movement({ id: 'two', type: 'expense', amountCents: 12050 })]), { income: 10000, expense: 12050, balance: -2050 });
});
test('El gráfico incluye TODOS los registros anteriores al intervalo y meses sin actividad', () => {
  const list = [movement({ id: 'a', date: '2024-02-01', amountCents: 100000 }), ...Array.from({ length: 20 }, (_, i) => movement({ id: String(i), amountCents: 100, date: '2025-01-01' })), movement({ id: 'out', date: '2026-08-11', type: 'expense', amountCents: 32000 }), movement({ id: 'in', date: '2026-09-12', amountCents: 5000 })];
  const series = monthlySeries(list, 6, new Date(2026, 8, 15));
  assert.equal(series[0].key, '2026-04');
  assert.deepEqual(series.map(x => x.balance), [102000, 102000, 102000, 102000, 70000, 75000]);
  assert.equal(series[0].income, 0);
  assert.equal(series[4].expense, 32000);
  assert.equal(series[5].income, 5000);
});
test('Fechas de calendario reales, incluido año bisiesto', () => {
  assert.equal(validDate('2024-02-29'), true);
  for (const d of ['2025-02-29', '2026-02-30', '2026-13-01', '', '2026-01-00', 'abc']) assert.equal(validDate(d), false);
  assert.equal(today(new Date(2026, 8, 15, 23, 59)), '2026-09-15');
});
test('Compatibilidad con respaldo original y conservación de caracteres de texto', () => {
  const legacy = [{ id: 'old', type: 'income', amount: 1250.95, reason: '<b>Ahorro</b>', date: '2026-08-31', note: 'Texto & comillas' }];
  const parsed = parseBackup(JSON.stringify(legacy));
  assert.equal(parsed.legacy, true);
  assert.equal(parsed.movements[0].amountCents, 125095);
  assert.equal(parsed.movements[0].category, 'savings');
  assert.equal(parsed.movements[0].reason, '<b>Ahorro</b>');
});
test('Idempotencia de importación y detección de IDs en conflicto', () => {
  const state = { ...emptyState(), movements: [movement()] };
  const backup = parseBackup(JSON.stringify(state));
  const result = mergeBackup(state, backup);
  assert.equal(result.added, 0); assert.equal(result.skipped, 1);
  assert.equal(result.state.movements.length, 1);
  assert.throws(() => mergeBackup(state, { ...backup, movements: [movement({ amountCents: 20000 })] }), /otra versión/);
  assert.throws(() => mergeBackup(state, { ...backup, currency: 'EUR' }), /moneda/);
});
test('Importar no borra movimientos y aplica moneda del respaldo solo a un historial vacío', () => {
  const current = { ...emptyState(), goal: { name: 'Viaje', targetCents: 100000 }, movements: [movement()] };
  const backup = { ...emptyState(), movements: [movement({ id: 'two' })] };
  const result = mergeBackup(current, backup);
  assert.equal(result.state.movements.length, 2);
  assert.deepEqual(result.state.goal, current.goal);
  assert.equal(mergeBackup(emptyState(), { ...backup, currency: 'DOP' }).state.currency, 'DOP');
});
test('Archivos inválidos se rechazan íntegramente, sin saltar registros', () => {
  assert.throws(() => parseBackup('bad json'));
  assert.throws(() => parseBackup('{"other":true}'));
  assert.throws(() => parseBackup(JSON.stringify({ ...emptyState(), movements: [movement(), movement()] })), /duplicados/);
  assert.throws(() => validateMovement(movement({ amountCents: -10 })));
  assert.throws(() => validateMovement(movement({ amountCents: 10.5 })));
  assert.throws(() => validateMovement(movement({ reason: '  ' })));
  assert.throws(() => validateState({ ...emptyState(), currency: '__proto__' }));
  assert.throws(() => validateState({ ...emptyState(), goal: { name: 'Meta', targetCents: 0 } }));
});
test('Migración automática conserva la clave antigua; los datos corruptos no se sobrescriben', () => {
  const map = new Map([[LEGACY_KEY, JSON.stringify([{ id: 'old', type: 'income', amount: 12, date: '2026-09-15', reason: 'Ahorro' }])]]);
  const storage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
  assert.equal(readStorage(storage).state.movements[0].amountCents, 1200);
  assert.ok(map.has(LEGACY_KEY)); assert.ok(map.has(STORAGE_KEY));
  map.set(STORAGE_KEY, 'CORRUPTO');
  assert.ok(readStorage(storage).error);
  assert.equal(map.get(STORAGE_KEY), 'CORRUPTO');
});
test('Filtros combinados, búsqueda sin acentos y salida CSV protegida', () => {
  const rows = [movement({ id: 'a', reason: 'Café', category: 'leisure', type: 'expense' }), movement({ id: 'b', reason: 'Salario', category: 'salary' })];
  assert.equal(filterMovements(rows, { query: 'CAFE', type: 'expense', category: 'leisure', month: '2026-09' }).length, 1);
  assert.equal(filterMovements(rows, { month: '2026-08' }).length, 0);
  const csv = csvExport([movement({ reason: '=1+1', note: 'Con "comillas"' })], 'USD');
  assert.ok(csv.startsWith('\ufeff'));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"Con ""comillas"""'));
});
