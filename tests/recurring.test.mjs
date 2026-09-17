import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { embeddedPool } from './helpers/embedded-pool.mjs';
import { migrate,newWallet,readWallet,writeWallet } from '../server/db.mjs';
import { createRecurringService } from '../server/recurring.mjs';
import { notificationFeed,markRead } from '../server/notifications.mjs';
import { nextOccurrence,zonedToday,budgetStatus,validateRecurring } from '../src/lib/planning.js';
import { emptyLedger } from '../src/lib/ledger.js';
import { createApi } from '../server/api.mjs';
import { createSession } from '../server/auth.mjs';
const payment={name:'Internet',amountCents:250000,currency:'DOP',category:'home',frequency:'monthly',nextDue:'2026-01-31'};
async function user(pool){const id=randomUUID();await pool.query('INSERT INTO ahorra.ahorra_users(id,email,password_hash,name) VALUES($1,$2,$3,$4)',[id,id+'@test.invalid','hash','Test']);await newWallet(pool,id);return id;}
const movement=(type,amount,id='m')=>({id,type,amountCents:amount,currency:'DOP',category:'other',reason:'Registro',date:'2026-01-31',note:''});
test('Calendario: 31 de enero → febrero → 31 de marzo, bisiestos, semanas y años',()=>{
 assert.equal(nextOccurrence('2026-01-31','monthly','2026-01-31'),'2026-02-28');assert.equal(nextOccurrence('2026-02-28','monthly','2026-01-31'),'2026-03-31');
 assert.equal(nextOccurrence('2028-01-31','monthly','2028-01-31'),'2028-02-29');assert.equal(nextOccurrence('2028-02-29','yearly','2028-02-29'),'2029-02-28');assert.equal(nextOccurrence('2031-02-28','yearly','2028-02-29'),'2032-02-29');
 assert.equal(nextOccurrence('2026-12-29','weekly','2026-12-29'),'2027-01-05');assert.equal(nextOccurrence('2026-12-31','monthly','2026-12-31'),'2027-01-31');
 assert.equal(zonedToday(new Date('2026-10-01T02:00:00Z')),'2026-09-30');assert.throws(()=>validateRecurring({...payment,amountCents:-1}));
});
test('Alertas: 80%, saldo RD$200 de RD$5,000, cero entradas y meta Laptop a RD$8,000',()=>{
 const base={...emptyLedger(),currency:'DOP',movements:[movement('income',500000,'income'),movement('expense',400000,'expense')]};
 assert.equal(budgetStatus(base).warning,true);assert.equal(budgetStatus(base).low,false);
 const low=budgetStatus({...base,movements:[base.movements[0],movement('expense',480000,'expense')]});assert.equal(low.balance,20000);assert.equal(low.low,true);assert.equal(low.usedPercent,96);
 assert.equal(budgetStatus(emptyLedger()).low,false);
 const goal=budgetStatus({...base,goal:{name:'Laptop',targetCents:4000000,currency:'DOP'},movements:[movement('income',3200000)]});assert.equal(goal.nearGoal,true);assert.equal(goal.remaining,800000);
 const fx=budgetStatus({...base,currency:'USD'});assert.equal(fx.warning,true);
});
test('SQL: vencimientos automáticos, reinicio, concurrencia, atraso y resolución sin cobro repetido',async()=>{
 const pool=await embeddedPool();try{await migrate(pool);const id=await user(pool),other=await user(pool);let now=new Date('2026-01-30T12:00:00Z');const service=()=>createRecurringService(pool,{now:()=>now});let worker=service();
 let list=await worker.save(id,payment);const schedule=list.items[0];assert.equal(list.items.length,1);assert.equal((await worker.list(other)).items.length,0);
 let feed=await notificationFeed(pool,id);assert.ok(feed.items.some(n=>n.kind==='payment_due'));assert.equal(feed.items.find(n=>n.kind==='payment_due').payload.amountCents,250000);
 await worker.tick();assert.equal((await readWallet(pool,id)).ledger.movements.length,0);
 now=new Date('2026-01-31T12:00:00Z');const old=await readWallet(pool,id);await Promise.all([worker.tick(),service().tick()]);let state=await readWallet(pool,id);assert.equal(state.ledger.movements.length,1);assert.equal(state.ledger.movements[0].date,'2026-01-31');assert.equal(state.ledger.movements[0].amountCents,250000);assert.equal(state.ledger.movements[0].type,'expense');assert.equal((await worker.list(id)).items[0].nextDue,'2026-02-28');
 await assert.rejects(writeWallet(pool,id,{revision:old.revision,ledger:old.ledger}),e=>e.message==='CONFLICT');
 worker=service();await worker.tick();assert.equal((await readWallet(pool,id)).ledger.movements.length,1,'worker restart does not repeat payment');
 now=new Date('2026-04-02T12:00:00Z');await worker.tick();state=await readWallet(pool,id);assert.deepEqual(state.ledger.movements.map(m=>m.date),['2026-01-31','2026-02-28','2026-03-31']);assert.equal((await worker.list(id)).items[0].nextDue,'2026-04-30');
 // Keep occurrence history even when a user deletes its financial movement.
 await writeWallet(pool,id,{revision:state.revision,ledger:{...state.ledger,movements:[]}});await worker.tick();assert.equal((await readWallet(pool,id)).ledger.movements.length,0);
 let current=(await worker.list(id)).items[0];await worker.action(id,current.id,{action:'pause',revision:current.revision});now=new Date('2026-07-01T12:00:00Z');await worker.tick();assert.equal((await readWallet(pool,id)).ledger.movements.length,0);
 current=(await worker.list(id)).items[0];await worker.action(id,current.id,{action:'resume',revision:current.revision});current=(await worker.list(id)).items[0];assert.equal(current.nextDue,'2026-07-31');
 await assert.rejects(worker.action(other,current.id,{action:'archive',revision:current.revision}),e=>e.message==='NOT_FOUND');await assert.rejects(worker.save(id,{...current,name:'Changed',revision:0},current.id),e=>e.message==='CONFLICT');
 await worker.action(id,current.id,{action:'archive',revision:current.revision});assert.equal((await worker.list(id)).items.length,0);assert.equal((await pool.query('SELECT count(*) AS n FROM ahorra.ahorra_recurring_occurrences WHERE user_id=$1',[id])).rows[0].n,3);
 // A Gmail/manual movement already exists on the due date. Do not double count it.
 now=new Date('2026-08-01T12:00:00Z');const saved=await readWallet(pool,id);await writeWallet(pool,id,{revision:saved.revision,ledger:{...saved.ledger,movements:[{...movement('expense',250000),date:'2026-08-01'}]}});
 const duplicate=(await worker.save(id,{...payment,nextDue:'2026-08-01'})).items[0];await worker.tick();current=(await worker.list(id)).items[0];assert.equal(current.lastError,'POSSIBLE_DUPLICATE');assert.equal((await readWallet(pool,id)).ledger.movements.length,1);assert.ok((await notificationFeed(pool,id)).items.some(n=>n.kind==='recurring_review'));
 await worker.action(id,duplicate.id,{action:'skip',revision:current.revision});assert.equal((await worker.list(id)).items[0].nextDue,'2026-09-01');assert.equal((await readWallet(pool,id)).ledger.movements.length,1);
 assert.equal((await readWallet(pool,other)).ledger.movements.length,0);
 }finally{await pool.end();}
});
test('SQL: notificaciones persistentes, leídas sin duplicarse, saldo bajo reaparece y umbral se rearma',async()=>{
 const pool=await embeddedPool();try{await migrate(pool);const id=await user(pool),other=await user(pool);let state=await readWallet(pool,id);
 const ledger={...state.ledger,currency:'DOP',movements:[movement('income',500000,'income'),movement('expense',480000,'expense')]};await writeWallet(pool,id,{revision:state.revision,ledger});
 let feed=await notificationFeed(pool,id);assert.equal(feed.budget.low,true);assert.equal(feed.budget.balance,20000);assert.equal(feed.items.filter(n=>n.kind==='budget80').length,1);assert.equal(feed.items.filter(n=>n.kind==='budget_low').length,1);
 await assert.rejects(markRead(pool,other,{id:feed.items[0].id}),e=>e.message==='NOT_FOUND');await markRead(pool,id,{all:true});feed=await notificationFeed(pool,id);assert.equal(feed.unread,0);assert.equal(feed.budget.low,true,'read state does not silence low-balance warning');assert.equal(feed.items.length,2);assert.equal((await notificationFeed(pool,other)).items.length,0);
 state=await readWallet(pool,id);await writeWallet(pool,id,{revision:state.revision,ledger:{...state.ledger,movements:[...state.ledger.movements,movement('income',500000,'income2')]}});assert.equal((await notificationFeed(pool,id)).budget.low,false);
 state=await readWallet(pool,id);await writeWallet(pool,id,{revision:state.revision,ledger:{...state.ledger,movements:[...state.ledger.movements,movement('expense',500000,'expense2')]}});feed=await notificationFeed(pool,id);assert.equal(feed.unread,2);assert.equal(feed.items.length,2,'threshold notices are reused rather than spammed');
 }finally{await pool.end();}
});
test('API: sesión obligatoria y programación aislada por usuario',async()=>{
 const pool=await embeddedPool();let server;try{await migrate(pool);const id=await user(pool),other=await user(pool);const token=await createSession(pool,id),otherToken=await createSession(pool,other);let handle;server=createServer((req,res)=>handle(req,res));server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
 handle=createApi(pool,{origins:[origin],recurringService:createRecurringService(pool,{now:()=>new Date('2026-01-30T12:00:00Z')})});
 async function request(path,method='GET',body,cookie=token){const r=await fetch(origin+'/api'+path,{method,headers:{Origin:origin,'X-Ahorra-Request':'1',...(cookie?{Cookie:`ahorra_session=${cookie}`}:{})},...(body?{headers:{Origin:origin,'X-Ahorra-Request':'1','Content-Type':'application/json',Cookie:`ahorra_session=${cookie}`},body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
 assert.equal((await request('/recurring','GET',null,'')).status,401);
 const created=await request('/recurring','POST',payment);assert.equal(created.status,201);const p=created.body.items[0];assert.equal((await request('/recurring','GET',null,otherToken)).body.items.length,0);assert.equal((await request(`/recurring/${p.id}/action`,'POST',{action:'archive',revision:0},otherToken)).status,404);
 assert.equal((await request('/notifications')).status,200);assert.equal((await request('/recurring','POST',{...payment,nextDue:'2026-01-29'})).status,400);
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await pool.end();}
});
