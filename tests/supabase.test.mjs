import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { embeddedPool } from './helpers/embedded-pool.mjs';
import { migrate,checkSchema,newWallet,readWallet,writeWallet } from '../server/db.mjs';
import { connectionOptions,connectionError } from '../server/connection.mjs';
import { exportData,importData,transferTables } from '../server/transfer.mjs';
import { hashPassword,verifyPassword,createSession,authenticate } from '../server/auth.mjs';
import { mailCrypto } from '../server/mail.mjs';
import { createRecurringService } from '../server/recurring.mjs';
import { emptyLedger } from '../src/lib/ledger.js';

test('Supabase: TLS remoto siempre verificado y errores sin contraseñas',()=>{
 const url='postgresql://postgres.example:secret-test@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=disable';
 const options=connectionOptions(url,{});assert.equal(options.ssl.rejectUnauthorized,true);assert.ok(!options.connectionString.includes('sslmode'));assert.equal(options.max,5);
 assert.equal(connectionOptions('postgresql://postgres:postgres@127.0.0.1:54322/postgres',{}).ssl,false);
 assert.throws(()=>connectionOptions(url.replace(':5432/',':6543/'),{}),/Session pooler/);
 assert.throws(()=>connectionOptions('https://example.supabase.co',{}),/cadena de conexión/);
 assert.throws(()=>connectionOptions('',{}),/DATABASE_URL/);
 assert.doesNotMatch(connectionError({code:'UNKNOWN',message:url}),/secret-test/);
});
test('Supabase: migración repetible, esquema privado y roles API sin acceso',async()=>{
 const pool=await embeddedPool();try{
  await assert.rejects(checkSchema(pool),e=>e.code==='MIGRATION_REQUIRED');
  await pool.query('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  await migrate(pool);await migrate(pool);await checkSchema(pool);
  const {rows}=await pool.query("SELECT relname,relrowsecurity FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='ahorra' AND relkind='r'");
  assert.equal(rows.length,11);assert.ok(rows.every(r=>r.relrowsecurity));
  for(const role of ['anon','authenticated','service_role']) {
   await pool.query(`SET ROLE ${role}`);
   try { await assert.rejects(pool.query('SELECT * FROM ahorra.ahorra_users'),e=>e.code==='42501'); } finally {await pool.query('RESET ROLE');}
  }
 }finally{await pool.end();}
});
test('Migración completa: origen antiguo, hashes, Gmail, pagos, sesión y rechazo atómico',async()=>{
 const source=await embeddedPool(),target=await embeddedPool();try{
  await migrate(source);await migrate(target);const id=randomUUID(),password='Migration-password-789',key='a'.repeat(64);
  await source.query('INSERT INTO ahorra.ahorra_users(id,email,password_hash,name,language,avatar) VALUES($1,$2,$3,$4,$5,$6)',[id,'migration@test.invalid',await hashPassword(password),'Ana María','en','data:image/png;base64,fixture']);
  await newWallet(source,id);const token=await createSession(source,id);
  await writeWallet(source,id,{revision:0,ledger:{...emptyLedger(),currency:'DOP',movements:[{id:'fund',type:'income',amountCents:500000,currency:'DOP',category:'savings',date:'2026-09-01',reason:'Presupuesto',note:''}]}});
  const secret=mailCrypto(key).encrypt('abcdabcdabcdabcd',id);
  await source.query("INSERT INTO ahorra.ahorra_mail_connections(user_id,settings,secret,mailbox,uid_validity,last_uid,lease_token,lease_until) VALUES($1,'{}',$2,'All Mail','999',123,$3,now()+interval '1 hour')",[id,secret,randomUUID()]);
  const recurring=createRecurringService(source,{now:()=>new Date('2026-09-17T15:00:00Z')});
  await recurring.save(id,{name:'Netflix',amountCents:60000,currency:'DOP',category:'other',frequency:'monthly',nextDue:'2026-09-17'});
  await recurring.tick();
  const expected=await readWallet(source,id);
  // Simulate the previous version's public schema, including its existing FKs.
  for(const table of transferTables) await source.query(`ALTER TABLE ahorra.${table} SET SCHEMA public`);
  const backup=await exportData(source,'public');assert.equal(backup.tables.ahorra_recurring_occurrences.length,1);assert.ok(backup.tables.ahorra_notifications.length);
  const malformed=structuredClone(backup);malformed.tables.ahorra_movements[0].amount_cents=-1;
  await assert.rejects(importData(target,malformed));assert.equal((await target.query('SELECT * FROM ahorra.ahorra_users')).rows.length,0,'failed import rolls back users too');
  await importData(target,backup);
  assert.deepEqual(await readWallet(target,id),expected);
  const user=(await target.query('SELECT * FROM ahorra.ahorra_users WHERE id=$1',[id])).rows[0];assert.equal(await verifyPassword(password,user.password_hash),true);assert.equal(user.name,'Ana María');assert.equal(user.language,'en');assert.equal(user.avatar,'data:image/png;base64,fixture');
  assert.equal((await authenticate(target,{headers:{cookie:'ahorra_session='+token}})).id,id);
  const mail=(await target.query('SELECT * FROM ahorra.ahorra_mail_connections WHERE user_id=$1',[id])).rows[0];assert.equal(mailCrypto(key).decrypt(mail.secret,id),'abcdabcdabcdabcd');assert.equal(Number(mail.last_uid),123);assert.equal(mail.lease_token,null);
  await createRecurringService(target,{now:()=>new Date('2026-09-17T15:00:00Z')}).tick();assert.deepEqual(await readWallet(target,id),expected,'paid occurrence not charged twice after migration');
  await assert.rejects(importData(target,backup),/destino ya contiene datos/);assert.deepEqual(await readWallet(target,id),expected);
 }finally{await source.end();await target.end();}
});
