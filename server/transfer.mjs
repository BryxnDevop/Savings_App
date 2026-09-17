import { checkSchema } from './db.mjs';
// Order follows foreign keys. Only these application tables can be copied.
export const transferTables = ['ahorra_users','ahorra_wallets','ahorra_movements','ahorra_sessions','ahorra_rate_cache','ahorra_mail_connections','ahorra_mail_events','ahorra_recurring','ahorra_recurring_occurrences','ahorra_notifications'];
const transferError = message => Object.assign(new Error(message), { code: 'TRANSFER_ERROR' });
export async function exportData(pool, schema = 'ahorra') {
  if (!['ahorra','public'].includes(schema)) throw transferError('Esquema de origen inválido.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tables = {};
    for (const table of transferTables) {
      const { rows } = await client.query(`SELECT to_jsonb(t) AS record FROM ${schema}.${table} t`);
      tables[table] = rows.map(row => row.record);
    }
    await client.query('COMMIT');
    return { format: 'ahorra-full', version: 1, exportedAt: new Date().toISOString(), tables };
  } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
export async function importData(pool, backup) {
  if (backup?.format !== 'ahorra-full' || backup.version !== 1 || !backup.tables || transferTables.some(t => !Array.isArray(backup.tables[t])) || Object.keys(backup.tables).some(t => !transferTables.includes(t))) throw transferError('Respaldo completo inválido. El JSON financiero de Ajustes no sirve para esta operación.');
  await checkSchema(pool);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`LOCK TABLE ${transferTables.map(t => 'ahorra.'+t).join(',')} IN ACCESS EXCLUSIVE MODE`);
    for (const table of transferTables) {
      const { rows } = await client.query(`SELECT 1 FROM ahorra.${table} LIMIT 1`);
      if (rows.length) throw transferError('El destino ya contiene datos. La importación requiere las tablas de Ahorra+ vacías; no se reemplazó nada.');
    }
    const counts = {};
    for (const table of transferTables) {
      const records = backup.tables[table];
      for (let i=0;i<records.length;i+=250) {
        await client.query(`INSERT INTO ahorra.${table} SELECT * FROM jsonb_populate_recordset(NULL::ahorra.${table}, $1::jsonb)`, [JSON.stringify(records.slice(i,i+250))]);
      }
      counts[table] = records.length;
    }
    await client.query('UPDATE ahorra.ahorra_mail_connections SET lease_token=NULL,lease_until=NULL');
    await client.query('COMMIT');
    return counts;
  } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
