import { randomUUID } from 'node:crypto';
import { validateRecurring,nextOccurrence,zonedToday,DEFAULT_TIME_ZONE } from '../src/lib/planning.js';
import { validateLedger } from '../src/lib/ledger.js';
import { lockedLedger } from './wallet-tools.mjs';
import { raiseNotice,reconcileAlerts } from './notifications.mjs';
import { fail } from './auth.mjs';
const fields="id,user_id,name,amount_cents,currency,category,frequency,to_char(anchor_date,'YYYY-MM-DD') AS anchor_date,to_char(next_due,'YYYY-MM-DD') AS next_due,enabled,archived,revision,last_error";
const present=r=>({id:r.id,name:r.name,amountCents:Number(r.amount_cents),currency:r.currency,category:r.category,frequency:r.frequency,nextDue:r.next_due,anchorDate:r.anchor_date,enabled:r.enabled,revision:r.revision,lastError:r.last_error});
const checkRevision=(row,value)=>{if(!Number.isInteger(value)||value<0)throw fail('INVALID_REVISION');if(row.revision!==value)throw fail('CONFLICT',409);};
export function createRecurringService(pool,{now=()=>new Date(),timeZone=process.env.APP_TIME_ZONE||DEFAULT_TIME_ZONE}={}){
 let running=false,stopped=false,timer;zonedToday(now(),timeZone);
 const today=()=>zonedToday(now(),timeZone);
 async function list(userId){const {rows}=await pool.query(`SELECT ${fields} FROM ahorra.ahorra_recurring WHERE user_id=$1 AND archived=false ORDER BY enabled DESC,next_due,name`,[userId]);return {items:rows.map(present),today:today(),timeZone};}
 async function save(userId,input,id){
  let value;try{value=validateRecurring(input);}catch{throw fail('INVALID_RECURRING');}
  const client=await pool.connect();try{await client.query('BEGIN');
   if(id){
    const {rows:[row]}=await client.query(`SELECT ${fields} FROM ahorra.ahorra_recurring WHERE user_id=$1 AND id=$2 AND archived=false FOR UPDATE`,[userId,id]);if(!row)throw fail('NOT_FOUND',404);checkRevision(row,input.revision);
    if(value.nextDue<today()&&value.nextDue!==row.next_due)throw fail('RECURRING_PAST_DATE');
    const anchor=value.nextDue!==row.next_due||value.frequency!==row.frequency?value.nextDue:row.anchor_date;
    if(value.nextDue!==row.next_due)await client.query("UPDATE ahorra.ahorra_notifications SET active=false,read_at=COALESCE(read_at,now()) WHERE user_id=$1 AND kind IN ('payment_due','recurring_review') AND payload->>'recurringId'=$2",[userId,id]);
    await client.query("UPDATE ahorra.ahorra_recurring SET name=$3,amount_cents=$4,currency=$5,category=$6,frequency=$7,next_due=$8,anchor_date=$9,revision=revision+1,last_error='' WHERE user_id=$1 AND id=$2",[userId,id,value.name,value.amountCents,value.currency,value.category,value.frequency,value.nextDue,anchor]);
   }else{
    if(value.nextDue<today())throw fail('RECURRING_PAST_DATE');
    await client.query('SELECT user_id FROM ahorra.ahorra_wallets WHERE user_id=$1 FOR UPDATE',[userId]);
    const {rows:[count]}=await client.query('SELECT count(*) AS count FROM ahorra.ahorra_recurring WHERE user_id=$1 AND archived=false',[userId]);if(Number(count.count)>=100)throw fail('RECURRING_LIMIT');
    id=randomUUID();await client.query('INSERT INTO ahorra.ahorra_recurring(id,user_id,name,amount_cents,currency,category,frequency,anchor_date,next_due) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8)',[id,userId,value.name,value.amountCents,value.currency,value.category,value.frequency,value.nextDue]);
   }
   await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  await reminders(userId);return list(userId);
 }
 async function reminders(userId){
  const day=today();const params=userId?[day,userId]:[day];
  const {rows}=await pool.query(`SELECT ${fields} FROM ahorra.ahorra_recurring WHERE enabled=true AND archived=false AND next_due>=$1::date AND next_due<=$1::date+1 ${userId?'AND user_id=$2':''}` ,params);
  for(const r of rows)await raiseNotice(pool,r.user_id,`upcoming:${r.id}:${r.next_due}`,'payment_due',{recurringId:r.id,name:r.name,amountCents:Number(r.amount_cents),currency:r.currency,due:r.next_due},{latch:true});
 }
 async function execute(userId,id,{revision,force=false,skip=false,automatic=false}={}){
  const client=await pool.connect();try{await client.query('BEGIN');
   const {rows:[r]}=await client.query(`SELECT ${fields} FROM ahorra.ahorra_recurring WHERE user_id=$1 AND id=$2 AND archived=false FOR UPDATE`,[userId,id]);
   if(!r){if(automatic){await client.query('COMMIT');return false;}throw fail('NOT_FOUND',404);}
   if(!automatic)checkRevision(r,revision);
   if(!r.enabled||r.next_due>today()){if(automatic){await client.query('COMMIT');return false;}throw fail('RECURRING_NOT_DUE',409);}
   if(automatic&&r.last_error){await client.query('COMMIT');return false;}
   const {rows:[existing]}=await client.query('SELECT status FROM ahorra.ahorra_recurring_occurrences WHERE user_id=$1 AND recurring_id=$2 AND due_date=$3',[userId,id,r.next_due]);
   const next=nextOccurrence(r.next_due,r.frequency,r.anchor_date);
   if(!existing){
    const ledger=await lockedLedger(client,userId);
    const movement={id:`recurring-${id}-${r.next_due}`,type:'expense',amountCents:Number(r.amount_cents),currency:r.currency,category:r.category,reason:r.name,date:r.next_due,note:'Pago recurrente · Ahorra+'};
    const duplicate=ledger.movements.some(m=>m.type==='expense'&&m.amountCents===movement.amountCents&&m.currency===movement.currency&&m.date===movement.date);
    let issue=!force&&!skip&&duplicate?'POSSIBLE_DUPLICATE':'';
    if(!skip&&!issue){try{validateLedger({...ledger,movements:[...ledger.movements,movement]});}catch{issue='WALLET_LIMIT';}}
    if(issue){
     await client.query('UPDATE ahorra.ahorra_recurring SET last_error=$3,revision=revision+1 WHERE user_id=$1 AND id=$2',[userId,id,issue]);
     await raiseNotice(client,userId,`recurring-review:${id}:${r.next_due}`,'recurring_review',{recurringId:id,name:r.name,amountCents:movement.amountCents,currency:r.currency,due:r.next_due,issue});
     await client.query('COMMIT');return false;
    }
    if(!skip){
     await client.query('INSERT INTO ahorra.ahorra_movements(user_id,id,type,amount_cents,currency,reason,date,note,category,position) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[userId,movement.id,movement.type,movement.amountCents,movement.currency,movement.reason,movement.date,movement.note,movement.category,ledger.movements.length]);
     await client.query('UPDATE ahorra.ahorra_wallets SET revision=revision+1,updated_at=now() WHERE user_id=$1',[userId]);
     await reconcileAlerts(client,userId,{...ledger,movements:[...ledger.movements,movement]});
    }
    await client.query('INSERT INTO ahorra.ahorra_recurring_occurrences(user_id,recurring_id,due_date,status,movement_id) VALUES($1,$2,$3,$4,$5)',[userId,id,r.next_due,skip?'skipped':'applied',skip?null:movement.id]);
    await raiseNotice(client,userId,`recurring:${id}:${r.next_due}`,skip?'recurring_skipped':'recurring_paid',{recurringId:id,name:r.name,amountCents:movement.amountCents,currency:r.currency,due:r.next_due});
   }
   await client.query("UPDATE ahorra.ahorra_recurring SET next_due=$3,last_error='',revision=revision+1 WHERE user_id=$1 AND id=$2",[userId,id,next]);
   await client.query("UPDATE ahorra.ahorra_notifications SET active=false,read_at=COALESCE(read_at,now()) WHERE user_id=$1 AND event_key IN ($2,$3)",[userId,`upcoming:${id}:${r.next_due}`,`recurring-review:${id}:${r.next_due}`]);
   await client.query('COMMIT');return true;
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }
 async function action(userId,id,input){
  if(['apply','skip'].includes(input.action)){await execute(userId,id,{revision:input.revision,force:input.action==='apply',skip:input.action==='skip'});await reminders(userId);return list(userId);}
  if(!['pause','resume','archive'].includes(input.action))throw fail('INVALID_RECURRING');
  const client=await pool.connect();try{await client.query('BEGIN');const {rows:[r]}=await client.query(`SELECT ${fields} FROM ahorra.ahorra_recurring WHERE user_id=$1 AND id=$2 AND archived=false FOR UPDATE`,[userId,id]);if(!r)throw fail('NOT_FOUND',404);checkRevision(r,input.revision);
   let due=r.next_due;
   if(input.action==='resume')while(due<today())due=nextOccurrence(due,r.frequency,r.anchor_date);
   await client.query("UPDATE ahorra.ahorra_recurring SET enabled=$3,archived=$4,next_due=$5,revision=revision+1,last_error='' WHERE user_id=$1 AND id=$2",[userId,id,input.action==='resume',input.action==='archive',due]);
   await client.query("UPDATE ahorra.ahorra_notifications SET active=false,read_at=COALESCE(read_at,now()) WHERE user_id=$1 AND kind IN ('payment_due','recurring_review') AND payload->>'recurringId'=$2",[userId,id]);
   await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  await reminders(userId);return list(userId);
 }
 async function tick(){
  if(running||stopped)return;running=true;
  try{
   for(let batch=0;batch<12&&!stopped;batch++){
    const {rows}=await pool.query("SELECT user_id,id FROM ahorra.ahorra_recurring WHERE enabled=true AND archived=false AND last_error='' AND next_due<=$1::date ORDER BY next_due,id LIMIT 100",[today()]);if(!rows.length)break;
    for(const r of rows)if(!stopped)await execute(r.user_id,r.id,{automatic:true});
   }
   if(!stopped)await reminders();
  }finally{running=false;}
 }
 const run=()=>tick().catch(()=>console.error('No se pudo completar la revisión de pagos recurrentes.'));
 return {list,save,action,execute,tick,reminders,start(){stopped=false;timer=setInterval(run,60000);timer.unref();run();},stop(){stopped=true;clearInterval(timer);}};
}
