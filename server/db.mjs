import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { emptyLedger, validateLedger } from '../src/lib/ledger.js';

export function createPool(connectionString) {
  if (!connectionString) throw new Error('Configura DATABASE_URL en .env antes de iniciar.');
  const pool = new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 15000 });
  pool.on('error', () => console.error('Se perdió una conexión con PostgreSQL.'));
  return pool;
}
export async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(73429051)');
    await client.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
export async function newWallet(client, userId) {
  const ledger = emptyLedger();
  await client.query('INSERT INTO ahorra_wallets(user_id,currency,rates,rate_info) VALUES($1,$2,$3,$4)', [userId, ledger.currency, JSON.stringify(ledger.rates), JSON.stringify(ledger.rateInfo)]);
}
export async function readWallet(pool, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const { rows: [w] } = await client.query('SELECT * FROM ahorra_wallets WHERE user_id=$1', [userId]);
    const { rows } = await client.query("SELECT id,type,amount_cents,currency,reason,to_char(date,'YYYY-MM-DD') AS date,note,category FROM ahorra_movements WHERE user_id=$1 ORDER BY position", [userId]);
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
    const { rows: [w] } = await client.query('SELECT revision FROM ahorra_wallets WHERE user_id=$1 FOR UPDATE', [userId]);
    if (!w || Number(w.revision) !== payload.revision) throw Object.assign(new Error('CONFLICT'), { status: 409 });
    await client.query('DELETE FROM ahorra_movements WHERE user_id=$1', [userId]);
    if (ledger.movements.length) {
      const records = ledger.movements.map((m, position) => ({ ...m, position }));
      await client.query(`INSERT INTO ahorra_movements(user_id,id,type,amount_cents,currency,reason,date,note,category,position)
        SELECT $1,id,type,"amountCents",currency,reason,date::date,note,category,position
        FROM jsonb_to_recordset($2::jsonb) AS x(id text,type text,"amountCents" bigint,currency text,reason text,date text,note text,category text,position integer)`, [userId, JSON.stringify(records)]);
    }
    const { rows: [updated] } = await client.query('UPDATE ahorra_wallets SET currency=$2,rates=$3,rate_info=$4,goal=$5,revision=revision+1,updated_at=now() WHERE user_id=$1 RETURNING revision', [userId, ledger.currency, JSON.stringify(ledger.rates), JSON.stringify(ledger.rateInfo), ledger.goal ? JSON.stringify(ledger.goal) : null]);
    await client.query('COMMIT');
    return { revision: Number(updated.revision), ledger };
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
