import { raiseNotice, reconcileAlerts } from './notifications.mjs';
import { readFile } from 'node:fs/promises';
import { emptyLedger, validateLedger } from '../src/lib/ledger.js';

export { createPool } from './connection.mjs';
export async function checkSchema(pool) {
  const { rows } = await pool.query("SELECT to_regclass('ahorra.schema_version') AS installed");
  if (!rows[0].installed) throw Object.assign(new Error('Faltan las tablas. Ejecuta npx supabase db push.'), { code: 'MIGRATION_REQUIRED' });
  const { rows: versions } = await pool.query('SELECT version FROM ahorra.schema_version WHERE id=1');
  if (versions[0]?.version !== 2) throw Object.assign(new Error('Versión de base incompatible. Ejecuta npx supabase db push para aplicar las migraciones nuevas.'), { code: 'MIGRATION_REQUIRED' });
  // Verify actual table access as well as the marker, without changing any data.
  await pool.query('SELECT u.id FROM ahorra.ahorra_users u LEFT JOIN ahorra.ahorra_wallets w ON w.user_id=u.id LIMIT 0');
}
// Fixture helper: production applies migrations with the Supabase CLI, never at startup.
export async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(73429051)');
    await client.query(await readFile(new URL('../supabase/migrations/20260917000000_ahorra_private.sql', import.meta.url), 'utf8'));
    await client.query(await readFile(new URL('../supabase/migrations/20260919000000_web_push.sql', import.meta.url), 'utf8'));
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
export async function newWallet(client, userId) {
  const ledger = emptyLedger();
  await client.query('INSERT INTO ahorra.ahorra_wallets(user_id,currency,rates,rate_info) VALUES($1,$2,$3,$4)', [userId, ledger.currency, JSON.stringify(ledger.rates), JSON.stringify(ledger.rateInfo)]);
}
export async function readWallet(pool, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const { rows: [w] } = await client.query('SELECT * FROM ahorra.ahorra_wallets WHERE user_id=$1', [userId]);
    const { rows } = await client.query("SELECT id,type,amount_cents,currency,reason,to_char(date,'YYYY-MM-DD') AS date,note,category FROM ahorra.ahorra_movements WHERE user_id=$1 ORDER BY position", [userId]);
    await client.query('COMMIT');
    if (!w) throw new Error('WALLET_NOT_FOUND');
    return { revision: Number(w.revision), ledger: { version: 3, currency: w.currency, rates: w.rates, rateInfo: w.rate_info, goal: w.goal, movements: rows.map(({ amount_cents, ...m }) => ({ ...m, amountCents: Number(amount_cents) })).map(m => ({ id:m.id,type:m.type,amountCents:m.amountCents,reason:m.reason,date:m.date,note:m.note,category:m.category,currency:m.currency })) } };
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
export async function writeWallet(pool, userId, payload) {
  if (!Number.isSafeInteger(payload?.revision) || payload.revision < 0) throw Object.assign(new Error('INVALID_REVISION'), { status: 400 });
  let ledger;
  try { ledger = validateLedger(payload.ledger); } catch (e) { throw Object.assign(new Error('INVALID_LEDGER'), { status: 400 }); }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [w] } = await client.query('SELECT revision FROM ahorra.ahorra_wallets WHERE user_id=$1 FOR UPDATE', [userId]);
    if (!w || Number(w.revision) !== payload.revision) throw Object.assign(new Error('CONFLICT'), { status: 409 });
    const { rows: existingMovements } = await client.query('SELECT id FROM ahorra.ahorra_movements WHERE user_id=$1', [userId]);
    const existingIds = new Set(existingMovements.map(row => row.id));
    await client.query('DELETE FROM ahorra.ahorra_movements WHERE user_id=$1', [userId]);
    if (ledger.movements.length) {
      const records = ledger.movements.map((m, position) => ({ ...m, position }));
      await client.query(`INSERT INTO ahorra.ahorra_movements(user_id,id,type,amount_cents,currency,reason,date,note,category,position)
        SELECT $1,id,type,"amountCents",currency,reason,date::date,note,category,position
        FROM jsonb_to_recordset($2::jsonb) AS x(id text,type text,"amountCents" bigint,currency text,reason text,date text,note text,category text,position integer)`, [userId, JSON.stringify(records)]);
    }
    const { rows: [updated] } = await client.query('UPDATE ahorra.ahorra_wallets SET currency=$2,rates=$3,rate_info=$4,goal=$5,revision=revision+1,updated_at=now() WHERE user_id=$1 RETURNING revision', [userId, ledger.currency, JSON.stringify(ledger.rates), JSON.stringify(ledger.rateInfo), ledger.goal ? JSON.stringify(ledger.goal) : null]);
    for (const movement of ledger.movements.filter(m => !existingIds.has(m.id))) {
      await raiseNotice(client,userId,`movement:${updated.revision}:${movement.id}`,'movement_new',{type:movement.type,amountCents:movement.amountCents,currency:movement.currency,reason:movement.reason,date:movement.date,movementId:movement.id});
    }
    await reconcileAlerts(client,userId,ledger);
    await client.query('COMMIT');
    return { revision: Number(updated.revision), ledger };
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
