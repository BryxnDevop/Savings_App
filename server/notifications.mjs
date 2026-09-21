import { randomUUID } from 'node:crypto';
import { budgetStatus } from '../src/lib/planning.js';
import { lockedLedger } from './wallet-tools.mjs';
import { fail } from './auth.mjs';
export async function raiseNotice(client,userId,key,kind,payload,{latch=false}={}){
 const sql=latch?`ON CONFLICT(user_id,event_key) DO UPDATE SET payload=EXCLUDED.payload,active=true,dismissed_at=CASE WHEN ahorra.ahorra_notifications.active AND ahorra.ahorra_notifications.payload->>'signature' IS NOT DISTINCT FROM EXCLUDED.payload->>'signature' THEN ahorra.ahorra_notifications.dismissed_at ELSE NULL END,read_at=CASE WHEN ahorra.ahorra_notifications.active AND ahorra.ahorra_notifications.payload->>'signature' IS NOT DISTINCT FROM EXCLUDED.payload->>'signature' THEN ahorra.ahorra_notifications.read_at ELSE NULL END,push_sent_at=CASE WHEN ahorra.ahorra_notifications.active AND ahorra.ahorra_notifications.payload->>'signature' IS NOT DISTINCT FROM EXCLUDED.payload->>'signature' THEN ahorra.ahorra_notifications.push_sent_at ELSE NULL END,created_at=CASE WHEN ahorra.ahorra_notifications.active AND ahorra.ahorra_notifications.payload->>'signature' IS NOT DISTINCT FROM EXCLUDED.payload->>'signature' THEN ahorra.ahorra_notifications.created_at ELSE now() END`:'ON CONFLICT(user_id,event_key) DO NOTHING';
 await client.query(`INSERT INTO ahorra.ahorra_notifications(id,user_id,event_key,kind,payload) VALUES($1,$2,$3,$4,$5) ${sql}`,[randomUUID(),userId,key,kind,JSON.stringify(payload)]);
}
export async function reconcileAlerts(client,userId,ledger){
 const s=budgetStatus(ledger);
 const goalSignature=ledger.goal?JSON.stringify(ledger.goal):'';
 for(const [kind,condition,payload] of [
  ['budget80',s.warning,{percent:s.usedPercent,balance:s.balance,currency:s.currency}],
  ['budget_low',s.low,{balance:s.balance,currency:s.currency}],
  ['goal_near',s.nearGoal,{name:s.goal?.name,remaining:s.remaining,currency:s.currency,signature:goalSignature}],
  ['goal_reached',s.goalReached,{name:s.goal?.name,signature:goalSignature}]
 ]){
  if(condition)await raiseNotice(client,userId,kind,kind,payload,{latch:true});
  else await client.query('UPDATE ahorra.ahorra_notifications SET active=false,read_at=COALESCE(read_at,now()) WHERE user_id=$1 AND event_key=$2 AND active=true',[userId,kind]);
 }
 return s;
}
export async function notificationFeed(pool,userId){
 const client=await pool.connect();let budget;
 try{await client.query('BEGIN');budget=await reconcileAlerts(client,userId,await lockedLedger(client,userId));await client.query('COMMIT');}
 catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 const [{rows:items},{rows:[count]},{rows:[preferences]}]=await Promise.all([
  pool.query('SELECT id,kind,payload,active,read_at,created_at FROM ahorra.ahorra_notifications WHERE user_id=$1 AND dismissed_at IS NULL ORDER BY (read_at IS NULL) DESC,created_at DESC,id DESC LIMIT 100',[userId]),
  pool.query('SELECT count(*) AS count FROM ahorra.ahorra_notifications WHERE user_id=$1 AND read_at IS NULL AND dismissed_at IS NULL',[userId]),
  pool.query('SELECT sound FROM ahorra.ahorra_notification_preferences WHERE user_id=$1',[userId])
 ]);
 return {items,unread:Number(count.count),sound:preferences?.sound??true,budget:{low:budget.low,balance:budget.balance,currency:budget.currency}};
}
export async function markRead(pool,userId,input){
 if(input.all===true)await pool.query('UPDATE ahorra.ahorra_notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL',[userId]);
 else{
  if(typeof input.id!=='string'||!/^[a-f0-9-]{36}$/.test(input.id))throw fail('INVALID_NOTIFICATION');
  const {rows}=await pool.query('UPDATE ahorra.ahorra_notifications SET read_at=COALESCE(read_at,now()) WHERE user_id=$1 AND id=$2 RETURNING id',[userId,input.id]);
  if(!rows.length)throw fail('NOT_FOUND',404);
 }
 return {ok:true};
}

export async function dismissNotifications(pool,userId,input){
 if(input?.all===true){
  await pool.query('UPDATE ahorra.ahorra_notifications SET dismissed_at=COALESCE(dismissed_at,now()),read_at=COALESCE(read_at,now()) WHERE user_id=$1 AND dismissed_at IS NULL',[userId]);
  return {ok:true};
 }
 if(typeof input?.id!=='string'||!/^[a-f0-9-]{36}$/.test(input.id))throw fail('INVALID_NOTIFICATION');
 const {rows}=await pool.query('UPDATE ahorra.ahorra_notifications SET dismissed_at=COALESCE(dismissed_at,now()),read_at=COALESCE(read_at,now()) WHERE user_id=$1 AND id=$2 AND dismissed_at IS NULL RETURNING id',[userId,input.id]);
 if(!rows.length)throw fail('NOT_FOUND',404);
 return {ok:true};
}
