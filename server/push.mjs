import { randomUUID } from 'node:crypto';
import { sendWebPush, validateVapid } from './web-push-protocol.mjs';
import { fail } from './auth.mjs';

const DEFAULT_PREFS = Object.freeze({ recurring: true, budget: true, movements: true, goals: true, bank: true, sound: true });
const categoryFor = kind => kind.startsWith('goal_') ? 'goals' : kind.startsWith('budget') ? 'budget' : kind.startsWith('movement_') ? 'movements' : kind.startsWith('bank_') ? 'bank' : ['payment_due','recurring_paid','recurring_skipped','recurring_review'].includes(kind) ? 'recurring' : 'budget';
const viewFor = kind => kind.startsWith('goal_') ? 'meta' : kind.startsWith('movement_') || kind.startsWith('budget') || kind === 'recurring_paid' ? 'movimientos' : kind.startsWith('bank_') ? 'ajustes' : 'recurrentes';
const money = (cents, currency, language='es') => new Intl.NumberFormat(language==='en'?'en-US':'es-DO',{style:'currency',currency,currencyDisplay:'narrowSymbol',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(cents||0)/100);
function content(kind,p,language='es') {
 const en=language==='en';
 switch(kind){
  case 'payment_due': {const days=Number(p.daysUntil);return {title:en?'Upcoming recurring payment':'Pago recurrente próximo',body:days===0?(en?`${p.name} is due today.`:`${p.name} vence hoy.`):days===1?(en?`${p.name} is due tomorrow.`:`${p.name} vence mañana.`):(en?`${p.name} is due in ${days} days.`:`Faltan ${days} días para ${p.name}.`)};}
  case 'budget80': return {title:en?'Budget alert':'Alerta de presupuesto',body:en?`You have used ${p.percent}% of your recorded income.`:`Has usado el ${p.percent}% de tus entradas registradas.`};
  case 'budget_low': return {title:en?'Your budget is running low':'Tu presupuesto está por acabarse',body:`${en?'Available balance':'Saldo disponible'}: ${money(p.balance,p.currency,language)} ${p.currency}`};
  case 'goal_near': return {title:en?'You are close to your goal!':'¡Estás cerca de tu meta!',body:en?`Only ${money(p.remaining,p.currency,language)} left to reach “${p.name}”.`:`Solo faltan ${money(p.remaining,p.currency,language)} para completar «${p.name}».`};
  case 'goal_reached': return {title:en?'Goal reached!':'¡Meta completada!',body:en?`You reached “${p.name}”. Keep it up!`:`Completaste «${p.name}». ¡Sigue así!`};
  case 'movement_new': return {title:en?'New movement recorded':'Nuevo movimiento registrado',body:`${p.type==='income'?(en?'Income':'Entrada'):(en?'Expense':'Salida')}: ${money(p.amountCents,p.currency,language)} ${p.currency} · ${p.reason}`};
  case 'recurring_paid': return {title:en?'Recurring payment recorded':'Pago recurrente registrado',body:`${p.name}: ${money(p.amountCents,p.currency,language)} ${p.currency}`};
  case 'recurring_skipped': return {title:en?'Recurring payment skipped':'Pago recurrente omitido',body:`${p.name} · ${p.due}`};
  case 'recurring_review': return {title:en?'Review a recurring payment':'Revisa un pago recurrente',body:en?`${p.name} needs your attention.`:`${p.name} necesita tu revisión.`};
  case 'bank_new': return {title:en?'New bank alert':'Nuevo aviso bancario',body:p.subject||''};
  default:return {title:'Ahorra+',body:en?'You have a new financial alert.':'Tienes un nuevo aviso financiero.'};
 }
}
function parsePrefs(row){return {...DEFAULT_PREFS,...(row||{})};}
function validateSubscription(input){
 const s=input?.subscription;const endpoint=s?.endpoint;const p256dh=s?.keys?.p256dh;const auth=s?.keys?.auth;
 try{const url=new URL(endpoint);if(url.protocol!=='https:')throw new Error();}catch{throw fail('PUSH_SUBSCRIPTION_INVALID');}
 if(typeof endpoint!=='string'||endpoint.length>4000||typeof p256dh!=='string'||p256dh.length<40||p256dh.length>300||typeof auth!=='string'||auth.length<10||auth.length>200)throw fail('PUSH_SUBSCRIPTION_INVALID');
 return {endpoint,p256dh,auth,userAgent:typeof input.userAgent==='string'?input.userAgent.slice(0,300):''};
}
export function createPushService(pool,{publicKey=process.env.VAPID_PUBLIC_KEY,privateKey=process.env.VAPID_PRIVATE_KEY,subject=process.env.VAPID_SUBJECT,fetchImpl=fetch}={}){
 const vapid={publicKey,privateKey,subject};const configured=validateVapid(vapid);
 async function prefs(userId){const {rows:[row]}=await pool.query('SELECT recurring,budget,movements,goals,bank,sound FROM ahorra.ahorra_notification_preferences WHERE user_id=$1',[userId]);return parsePrefs(row);}
 async function status(userId){const [preferences,{rows:[count]}]=await Promise.all([prefs(userId),pool.query('SELECT count(*) AS count FROM ahorra.ahorra_push_subscriptions WHERE user_id=$1',[userId])]);return {configured,publicKey:configured?publicKey:'',subscriptions:Number(count.count),preferences};}
 async function subscribe(userId,input){
  if(!configured)throw fail('PUSH_NOT_CONFIGURED',503);const value=validateSubscription(input);
  const client=await pool.connect();try{await client.query('BEGIN');
   await client.query('INSERT INTO ahorra.ahorra_notification_preferences(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING',[userId]);
   await client.query('UPDATE ahorra.ahorra_notifications SET push_sent_at=COALESCE(push_sent_at,now()) WHERE user_id=$1 AND push_sent_at IS NULL',[userId]);
   await client.query(`INSERT INTO ahorra.ahorra_push_subscriptions(id,user_id,endpoint,p256dh,auth,user_agent) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,user_agent=EXCLUDED.user_agent,updated_at=now()`,[randomUUID(),userId,value.endpoint,value.p256dh,value.auth,value.userAgent]);
   await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  return status(userId);
 }
 async function unsubscribe(userId,input){if(typeof input?.endpoint!=='string')throw fail('PUSH_SUBSCRIPTION_INVALID');await pool.query('DELETE FROM ahorra.ahorra_push_subscriptions WHERE user_id=$1 AND endpoint=$2',[userId,input.endpoint]);return status(userId);}
 async function setPreferences(userId,input){
  const next={};for(const key of Object.keys(DEFAULT_PREFS)){if(typeof input?.[key]!=='boolean')throw fail('PUSH_PREFERENCES_INVALID');next[key]=input[key];}
  await pool.query(`INSERT INTO ahorra.ahorra_notification_preferences(user_id,recurring,budget,movements,goals,bank,sound) VALUES($1,$2,$3,$4,$5,$6,$7)
   ON CONFLICT(user_id) DO UPDATE SET recurring=EXCLUDED.recurring,budget=EXCLUDED.budget,movements=EXCLUDED.movements,goals=EXCLUDED.goals,bank=EXCLUDED.bank,sound=EXCLUDED.sound,updated_at=now()`,[userId,next.recurring,next.budget,next.movements,next.goals,next.bank,next.sound]);
  return status(userId);
 }
 async function dispatchUser(userId,{limit=30}={}){
  if(!configured)return {sent:0,skipped:true};
  await pool.query("UPDATE ahorra.ahorra_notifications SET push_sent_at=now() WHERE user_id=$1 AND push_sent_at IS NULL AND created_at<now()-interval '7 days'",[userId]);
  const [preferences,{rows:subscriptions},{rows:notices}]=await Promise.all([
   prefs(userId),
   pool.query('SELECT id,endpoint,p256dh,auth FROM ahorra.ahorra_push_subscriptions WHERE user_id=$1 ORDER BY updated_at DESC',[userId]),
   pool.query(`SELECT n.id,n.event_key,n.kind,n.payload,n.created_at,u.language FROM ahorra.ahorra_notifications n JOIN ahorra.ahorra_users u ON u.id=n.user_id
    WHERE n.user_id=$1 AND n.active=true AND n.dismissed_at IS NULL AND n.push_sent_at IS NULL ORDER BY n.created_at,n.id LIMIT $2`,[userId,limit])
  ]);
  if(!subscriptions.length)return {sent:0,subscriptions:0};let sent=0;
  for(const notice of notices){
   const category=categoryFor(notice.kind);
   if(preferences[category]===false){await pool.query('UPDATE ahorra.ahorra_notifications SET push_sent_at=now() WHERE id=$1',[notice.id]);continue;}
   const copy=content(notice.kind,notice.payload,notice.language);const payload={...copy,kind:notice.kind,tag:`ahorra-${notice.event_key}`.slice(0,180),url:`/#${viewFor(notice.kind)}`,silent:!preferences.sound,vibrate:preferences.sound?[160,80,160]:undefined,timestamp:new Date(notice.created_at).getTime()};
   let delivered=false;
   for(const sub of subscriptions){
    try{await sendWebPush({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},payload,vapid,{fetchImpl,urgency:['budget_low','payment_due','recurring_review'].includes(notice.kind)?'high':'normal'});delivered=true;}
    catch(e){if([404,410].includes(e.statusCode))await pool.query('DELETE FROM ahorra.ahorra_push_subscriptions WHERE id=$1',[sub.id]);else console.error('Ahorra+ push:',e.code||e.message);}
   }
   if(delivered){await pool.query('UPDATE ahorra.ahorra_notifications SET push_sent_at=now() WHERE id=$1',[notice.id]);sent++;}
  }
  return {sent,subscriptions:subscriptions.length};
 }
 async function dispatchAll({limitUsers=100,limitPerUser=30}={}){
  if(!configured)return {sent:0,users:0,skipped:true};
  const {rows}=await pool.query(`SELECT DISTINCT n.user_id FROM ahorra.ahorra_notifications n WHERE n.active=true AND n.dismissed_at IS NULL AND n.push_sent_at IS NULL AND n.created_at>=now()-interval '7 days' ORDER BY n.user_id LIMIT $1`,[limitUsers]);
  let sent=0;for(const row of rows){const result=await dispatchUser(row.user_id,{limit:limitPerUser});sent+=result.sent||0;}return {sent,users:rows.length};
 }
 async function sendTest(userId,input={}){
  if(!configured)throw fail('PUSH_NOT_CONFIGURED',503);
  const delaySeconds=input?.delaySeconds===undefined?8:Number(input.delaySeconds);
  if(!Number.isInteger(delaySeconds)||delaySeconds<0||delaySeconds>15)throw fail('PUSH_TEST_INVALID');
  const [preferences,{rows:subscriptions},{rows:[user]}]=await Promise.all([
   prefs(userId),
   pool.query('SELECT id,endpoint,p256dh,auth FROM ahorra.ahorra_push_subscriptions WHERE user_id=$1 ORDER BY updated_at DESC',[userId]),
   pool.query('SELECT language FROM ahorra.ahorra_users WHERE id=$1',[userId])
  ]);
  if(!subscriptions.length)throw fail('PUSH_NO_SUBSCRIPTIONS',409);
  if(delaySeconds)await new Promise(resolve=>setTimeout(resolve,delaySeconds*1000));
  const en=user?.language==='en';
  const payload={
   title:en?'Ahorra+ server push test':'Prueba push de Ahorra+',
   body:en?'This alert came from the server. Push works even when the app is closed.':'Este aviso llegó desde el servidor. El push funciona aunque la app esté cerrada.',
   kind:'push_test',
   tag:`ahorra-test-${randomUUID()}`,
   url:'/#ajustes',
   silent:!preferences.sound,
   vibrate:preferences.sound?[160,80,160]:undefined,
   timestamp:Date.now()
  };
  let sent=0;
  for(const sub of subscriptions){
   try{await sendWebPush({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},payload,vapid,{fetchImpl,urgency:'high'});sent++;}
   catch(e){if([404,410].includes(e.statusCode))await pool.query('DELETE FROM ahorra.ahorra_push_subscriptions WHERE id=$1',[sub.id]);else console.error('Ahorra+ push test:',e.code||e.message);}
  }
  if(!sent)throw fail('PUSH_DELIVERY_FAILED',502);
  return {ok:true,sent,delaySeconds};
 }
 return {configured,status,subscribe,unsubscribe,setPreferences,dispatchUser,dispatchAll,sendTest};
}
