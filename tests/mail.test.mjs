import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { parseBankMail, validateMailSettings, authenticatedSender } from '../server/bank-parser.mjs';
import { createMailService, mailCrypto } from '../server/mail.mjs';
import { embeddedPool } from './helpers/embedded-pool.mjs';
import { migrate, newWallet, readWallet, writeWallet } from '../server/db.mjs';
const settings=validateMailSettings({email:'owner@gmail.com',senders:'alertas@banco.example',amountLabel:'Monto',expenseWord:'Consumo',incomeWord:'Depósito',referenceLabel:'Referencia',decimal:'.',automatic:true});
const receivedAt=new Date('2026-09-15T18:20:00Z');
function mail(text='Consumo aprobado\nMonto: DOP 1,250.00\nReferencia: ABC12345',extra={}){return {subject:'Aviso de movimiento',text,from:{value:[{address:'alertas@banco.example'}]},headerLines:[{key:'authentication-results',line:'Authentication-Results: mx.google.com; dkim=pass header.i=@banco.example; spf=pass; dmarc=pass header.from=banco.example'}],...extra};}
test('Correo: interpreta gasto e ingreso y decimales sin convertir la moneda original',()=>{
 const expense=parseBankMail(mail(),settings,receivedAt);assert.equal(expense.issue,'');assert.equal(expense.candidate.amountCents,125000);assert.equal(expense.candidate.currency,'DOP');assert.equal(expense.candidate.type,'expense');assert.equal(expense.candidate.date,'2026-09-15');assert.ok(expense.fingerprint);
 const income=parseBankMail(mail('Depósito confirmado\nMonto: EUR 1.234,56\nReferencia: ABC99887'),{...settings,decimal:','},receivedAt);assert.equal(income.candidate.type,'income');assert.equal(income.candidate.amountCents,123456);assert.equal(income.issue,'');
});
test('Correo: rechaza importes ambiguos, remitentes no autorizados y transacciones rechazadas',()=>{
 for(const text of ['Consumo rechazado\nMonto: USD 20.00','Consumo pendiente\nMonto: USD 20.00','Consumo no aprobado\nMonto: USD 20.00\nReferencia: ABC12345'])assert.equal(parseBankMail(mail(text),settings,receivedAt).issue,'NOT_CONFIRMED');
 for(const text of ['Consumo\nMonto: $ 20.00','Consumo\nMonto: DOP 1.234','Consumo\nMonto: DOP 20.00\nMonto: DOP 21.00','Consumo\nMonto: USD 1,23.45'])assert.equal(parseBankMail(mail(text),settings,receivedAt).issue,'AMOUNT_UNCLEAR');
 assert.equal(parseBankMail(mail('Consumo y depósito\nMonto: USD 20.00'),settings,receivedAt).issue,'TYPE_UNCLEAR');
 assert.equal(parseBankMail(mail(undefined,{from:{value:[{address:'fake@banco.example'}]}}),settings,receivedAt),null);
 assert.equal(parseBankMail(mail('Consumo\nMonto: USD 20.00'),settings,receivedAt).issue,'REFERENCE_MISSING');
});
test('Correo: firma de Gmail alineada con remitente, no cabeceras de terceros ni falsos positivos',()=>{
 assert.equal(authenticatedSender(mail(),'alertas@banco.example'),true);
 for(const header of ['Authentication-Results: evil.example; dkim=pass header.i=@banco.example; dmarc=pass header.from=banco.example','Authentication-Results: mx.google.com; dkim=fail header.i=@banco.example; dmarc=pass header.from=banco.example','Authentication-Results: mx.google.com; dkim=pass header.i=@other.example; dmarc=pass header.from=banco.example'])assert.equal(parseBankMail(mail(undefined,{headerLines:[{key:'authentication-results',line:header}]}),settings,receivedAt).issue,'SENDER_UNVERIFIED');
});
test('Correo: credenciales cifradas y vinculadas al usuario; alteraciones se rechazan',()=>{
 const crypto=mailCrypto('a'.repeat(64));const encrypted=crypto.encrypt('abcdabcdabcdabcd','user-a');assert.ok(!encrypted.includes('abcd'));assert.equal(crypto.decrypt(encrypted,'user-a'),'abcdabcdabcdabcd');assert.throws(()=>crypto.decrypt(encrypted,'user-b'));assert.equal(mailCrypto('bad-key'),null);
});
test('PostgreSQL: revisión horaria, descuento único, aislamiento, conflictos y pendientes',async()=>{
 const pool=await embeddedPool();try{
  await migrate(pool);const user=randomUUID(),other=randomUUID();for(const id of [user,other]){await pool.query('INSERT INTO ahorra.ahorra_users(id,email,password_hash,name) VALUES($1,$2,$3,$4)',[id,id+'@test.invalid','hash','Test']);await newWallet(pool,id);}
  let inbox=[],failTransport=false,scans=0;
  const transport={async connect(){return {mailbox:'All Mail',uidValidity:'99',lastUid:10};},async scan(c,password,consume){scans++;assert.equal(password,'abcdabcdabcdabcd');if(failTransport)throw new Error('secret must not leak');for(const item of inbox)await consume(item);return {lastUid:inbox.at(-1)?.uid||Number(c.last_uid),more:false};}};
  const service=createMailService(pool,{key:'b'.repeat(64),transport});
  const config={...settings,senders:settings.senders.join('\n'),password:'abcd abcd abcd abcd'};
  const status=await service.connect(user,config);assert.equal(status.connection.enabled,true);assert.ok(!JSON.stringify(status).includes('abcd'));assert.equal(status.connection.settings.automatic,true);
  const {rows:[stored]}=await pool.query('SELECT * FROM ahorra.ahorra_mail_connections WHERE user_id=$1',[user]);assert.notEqual(stored.secret,'abcdabcdabcdabcd');assert.equal(Number(stored.last_uid),10);
  await service.tick();assert.equal(scans,0,'not due until an hour after connecting');
  async function due(){await pool.query("UPDATE ahorra.ahorra_mail_connections SET next_check=now()-interval '1 second' WHERE user_id=$1",[user]);await service.tick();}
  const old=await readWallet(pool,user);
  inbox=[{uid:11,key:'gmail-11',receivedAt,mail:mail()}];await due();let current=await readWallet(pool,user);assert.equal(current.ledger.movements.length,1);assert.equal(current.ledger.movements[0].amountCents,125000);assert.equal(current.ledger.movements[0].type,'expense');assert.equal(current.revision,old.revision+1);assert.equal((await service.status(user)).counts.applied,1);assert.equal((await pool.query("SELECT count(*) AS count FROM ahorra.ahorra_notifications WHERE user_id=$1 AND kind='bank_new'",[user])).rows[0].count,1);
  assert.equal((await readWallet(pool,other)).ledger.movements.length,0);assert.equal((await service.status(other)).events.length,0);
  await assert.rejects(writeWallet(pool,user,{revision:old.revision,ledger:old.ledger}),e=>e.message==='CONFLICT');
  await due();assert.equal((await readWallet(pool,user)).ledger.movements.length,1,'same email never applied twice');assert.equal((await pool.query("SELECT count(*) AS count FROM ahorra.ahorra_notifications WHERE user_id=$1 AND kind='bank_new'",[user])).rows[0].count,1);
  inbox=[{uid:12,key:'gmail-12',receivedAt,mail:mail()}];await due();assert.equal((await readWallet(pool,user)).ledger.movements.length,1,'duplicate bank reference never applied twice');let pending=(await service.status(user)).events.find(e=>e.issue==='DUPLICATE_REFERENCE');assert.ok(pending);await assert.rejects(service.review(user,pending.id,'apply'),e=>e.message==='MAIL_DUPLICATE_REFERENCE');
  inbox=[{uid:13,key:'gmail-13',receivedAt,mail:mail('Consumo\nMonto: USD 5.00')}];await due();pending=(await service.status(user)).events.find(e=>e.issue==='REFERENCE_MISSING');assert.ok(pending);await assert.rejects(service.review(other,pending.id,'apply'),e=>e.message==='NOT_FOUND');await service.review(user,pending.id,'apply');assert.equal((await readWallet(pool,user)).ledger.movements.length,2);await assert.rejects(service.review(user,pending.id,'apply'),e=>e.message==='CONFLICT');
  inbox=[{uid:14,key:'gmail-14',receivedAt,mail:mail('Consumo rechazado\nMonto: USD 8.00\nReferencia: ZZZ12345')}];await due();pending=(await service.status(user)).events.find(e=>e.issue==='NOT_CONFIRMED');assert.equal(pending.candidate,null);await service.review(user,pending.id,'dismiss');assert.equal((await service.status(user)).events.find(e=>e.id===pending.id).status,'dismissed');
  await service.settings(user,{...config,automatic:true,enabled:false});await due();const scansBefore=scans;await service.tick();assert.equal(scans,scansBefore);
  await service.settings(user,{...config,automatic:false,enabled:true});inbox=[{uid:15,key:'gmail-15',receivedAt,mail:mail('Depósito\nMonto: USD 50.00\nReferencia: QQQ12345')}];await due();pending=(await service.status(user)).events.find(e=>e.candidate?.amountCents===5000);assert.equal(pending.status,'pending','manual mode does not change balance');await service.review(user,pending.id,'apply');assert.equal((await readWallet(pool,user)).ledger.movements.length,3);
  failTransport=true;await due();const failed=await service.status(user);assert.equal(failed.connection.last_error,'MAIL_CHECK_FAILED');assert.ok(!JSON.stringify(failed).includes('secret must not leak'));assert.equal((await readWallet(pool,user)).ledger.movements.length,3);
  await service.disconnect(user);assert.equal((await service.status(user)).connection,null);assert.equal((await readWallet(pool,user)).ledger.movements.length,3);assert.equal((await pool.query('SELECT * FROM ahorra.ahorra_mail_connections')).rows.length,0);
 }finally{await pool.end();}
});
