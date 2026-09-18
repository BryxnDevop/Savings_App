import { raiseNotice, reconcileAlerts } from './notifications.mjs';
import { randomBytes, randomUUID, createCipheriv, createDecipheriv } from 'node:crypto';
import { gmailTransport } from './gmail.mjs';
import { digest, validateMailSettings, parseBankMail } from './bank-parser.mjs';
import { validateLedger } from '../src/lib/ledger.js';
import { fail } from './auth.mjs';

export function mailCrypto(hex) {
  if(!/^[a-f0-9]{64}$/i.test(hex||''))return null;
  const key=Buffer.from(hex,'hex');
  return {
    encrypt(value,userId){const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(userId));const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),ciphertext].map(b=>b.toString('base64')).join('.');},
    decrypt(value,userId){const [iv,tag,data]=value.split('.').map(b=>Buffer.from(b,'base64'));const cipher=createDecipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(userId));cipher.setAuthTag(tag);return Buffer.concat([cipher.update(data),cipher.final()]).toString('utf8');}
  };
}
async function addMovement(client,userId,event,{manual=false}={}) {
  const c=event.candidate;if(!c)throw fail('MAIL_NO_CANDIDATE');
  const {rows:[wallet]}=await client.query('SELECT * FROM ahorra.ahorra_wallets WHERE user_id=$1 FOR UPDATE',[userId]);
  if(event.fingerprint){
    const {rows}=await client.query("SELECT id FROM ahorra.ahorra_mail_events WHERE user_id=$1 AND fingerprint=$2 AND status='applied' AND id<>$3 LIMIT 1",[userId,event.fingerprint,event.id]);
    if(rows.length)return 'DUPLICATE_REFERENCE';
  }
  const {rows}=await client.query("SELECT id,type,amount_cents,currency,reason,to_char(date,'YYYY-MM-DD') AS date,note,category FROM ahorra.ahorra_movements WHERE user_id=$1 ORDER BY position",[userId]);
  if(!manual && rows.some(m=>m.type===c.type&&Number(m.amount_cents)===c.amountCents&&m.currency===c.currency&&m.date===c.date))return 'POSSIBLE_DUPLICATE';
  const movement={...c,id:`mail-${event.id}`};
  try{validateLedger({version:3,currency:wallet.currency,rates:wallet.rates,rateInfo:wallet.rate_info,goal:wallet.goal,movements:[...rows.map(({amount_cents,...m})=>({...m,amountCents:Number(amount_cents)})),movement]});}catch{return 'WALLET_LIMIT';}
  await client.query('INSERT INTO ahorra.ahorra_movements(user_id,id,type,amount_cents,currency,reason,date,note,category,position) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[userId,movement.id,c.type,c.amountCents,c.currency,c.reason,c.date,c.note,c.category,rows.length]);
  await client.query('UPDATE ahorra.ahorra_wallets SET revision=revision+1,updated_at=now() WHERE user_id=$1',[userId]);
  await client.query("UPDATE ahorra.ahorra_mail_events SET status='applied',movement_id=$2 WHERE id=$1",[event.id,movement.id]);
  await reconcileAlerts(client,userId,{version:3,currency:wallet.currency,rates:wallet.rates,rateInfo:wallet.rate_info,goal:wallet.goal,movements:[...rows.map(({amount_cents,...m})=>({...m,amountCents:Number(amount_cents)})),movement]});
  return '';
}
export function createMailService(pool,{key=process.env.MAIL_ENCRYPTION_KEY,transport=gmailTransport,synchronous=false}={}) {
  const crypt=mailCrypto(key);let active=false;let stopped=false;let timer;
  async function status(userId){
    const {rows:[c]}=await pool.query('SELECT settings,enabled,last_check,next_check,last_error,lease_until,connected_at FROM ahorra.ahorra_mail_connections WHERE user_id=$1',[userId]);
    const {rows:events}=await pool.query("SELECT id,sender,subject,received_at,candidate,issue,status,movement_id FROM ahorra.ahorra_mail_events WHERE user_id=$1 ORDER BY (status='pending') DESC,created_at DESC LIMIT 100",[userId]);
    const {rows:[counts]}=await pool.query("SELECT count(*) FILTER(WHERE status='pending') AS pending,count(*) FILTER(WHERE status='applied') AS applied FROM ahorra.ahorra_mail_events WHERE user_id=$1",[userId]);
    return {available:!!crypt,connection:c?{...c,settings:{...c.settings,senders:c.settings.senders.join('\n')},checking:c.lease_until&&new Date(c.lease_until)>new Date()}:null,events,counts:{pending:Number(counts.pending),applied:Number(counts.applied)}};
  }
  async function connect(userId,input){
    if(!crypt)throw fail('MAIL_KEY_MISSING',503);
    let settings;try{settings=validateMailSettings(input);}catch{throw fail('MAIL_INVALID_SETTINGS');}
    const password=String(input.password||'').replace(/\s/g,'');
    if(!/^[a-z]{16}$/i.test(password))throw fail('MAIL_APP_PASSWORD');
    let box;try{box=await transport.connect(settings.email,password);}catch{throw fail('MAIL_CONNECT_FAILED',502);}
    await pool.query(`INSERT INTO ahorra.ahorra_mail_connections(user_id,settings,secret,mailbox,uid_validity,last_uid,next_check)
      VALUES($1,$2,$3,$4,$5,$6,now()+interval '1 hour') ON CONFLICT(user_id) DO UPDATE SET settings=EXCLUDED.settings,secret=EXCLUDED.secret,mailbox=EXCLUDED.mailbox,uid_validity=EXCLUDED.uid_validity,last_uid=EXCLUDED.last_uid,enabled=true,next_check=EXCLUDED.next_check,last_error='',lease_token=NULL,lease_until=NULL,connected_at=now()`,[userId,JSON.stringify(settings),crypt.encrypt(password,userId),box.mailbox,box.uidValidity,box.lastUid]);
    return status(userId);
  }
  async function settings(userId,input){
    let next;try{next=validateMailSettings(input);}catch{throw fail('MAIL_INVALID_SETTINGS');}
    const client=await pool.connect();try{await client.query('BEGIN');const {rows:[c]}=await client.query('SELECT settings,lease_until FROM ahorra.ahorra_mail_connections WHERE user_id=$1 FOR UPDATE',[userId]);
      if(!c)throw fail('MAIL_NOT_CONNECTED',404);if(c.lease_until&&new Date(c.lease_until)>new Date())throw fail('BUSY',409);
      if(c.settings.email!==next.email)throw fail('MAIL_RECONNECT');
      await client.query('UPDATE ahorra.ahorra_mail_connections SET settings=$2,enabled=$3 WHERE user_id=$1',[userId,JSON.stringify(next),input.enabled!==false]);await client.query('COMMIT');
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}return status(userId);
  }
  async function disconnect(userId){await pool.query('DELETE FROM ahorra.ahorra_mail_connections WHERE user_id=$1',[userId]);return status(userId);}
  async function ingest(c,item){
    const parsed=parseBankMail(item.mail,c.settings,item.receivedAt);if(!parsed)return;
    if(item.oversized){parsed.candidate=null;parsed.issue='MESSAGE_TOO_LARGE';}
    const messageKey=digest(`${c.settings.email}|${item.key}`);
    const client=await pool.connect();try{
      await client.query('BEGIN');
      const {rows:[live]}=await client.query('SELECT lease_token,enabled FROM ahorra.ahorra_mail_connections WHERE user_id=$1 FOR UPDATE',[c.user_id]);
      if(!live||live.lease_token!==c.lease_token||!live.enabled)throw new Error('MAIL_STOPPED');
      const event={...parsed,id:randomUUID()};
      const {rows:inserted}=await client.query(`INSERT INTO ahorra.ahorra_mail_events(id,user_id,message_key,fingerprint,sender,subject,received_at,candidate,issue,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending') ON CONFLICT(user_id,message_key) DO NOTHING RETURNING id`,[event.id,c.user_id,messageKey,event.fingerprint||null,event.sender,event.subject,event.receivedAt,event.candidate?JSON.stringify(event.candidate):null,event.issue]);
      if(inserted.length&&event.candidate&&!event.issue&&c.settings.automatic){const issue=await addMovement(client,c.user_id,event);if(issue)await client.query('UPDATE ahorra.ahorra_mail_events SET issue=$2 WHERE id=$1',[event.id,issue]);}
      if(inserted.length)await raiseNotice(client,c.user_id,`bank:${event.id}`,'bank_new',{subject:event.subject,eventId:event.id});
      await client.query('UPDATE ahorra.ahorra_mail_connections SET last_uid=GREATEST(last_uid,$2) WHERE user_id=$1',[c.user_id,item.uid]);
      await client.query('COMMIT');
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }
  async function tick({userId,maxAccounts=5,deadline=Infinity}={}){
    if(active||stopped||!crypt)return;active=true;
    try{
      for(let i=0;i<maxAccounts&&!stopped&&Date.now()<deadline;i++){
        const token=randomUUID();
        const {rows:[c]}=await pool.query(`UPDATE ahorra.ahorra_mail_connections SET lease_token=$1,lease_until=now()+interval '10 minutes' WHERE user_id=(SELECT user_id FROM ahorra.ahorra_mail_connections WHERE ($2::uuid IS NULL OR user_id=$2) AND enabled=true AND next_check<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_check FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,[token,userId||null]);
        if(!c)break;
        try{
          const password=crypt.decrypt(c.secret,c.user_id);
          const result=await transport.scan(c,password,item=>ingest(c,item));
          await pool.query("UPDATE ahorra.ahorra_mail_connections SET last_uid=GREATEST(last_uid,$3),last_check=now(),next_check=now()+($4 * interval '1 second'),last_error='',lease_token=NULL,lease_until=NULL WHERE user_id=$1 AND lease_token=$2",[c.user_id,token,result.lastUid,result.more?60:3600]);
        }catch(e){const code=e.message==='MAIL_RECONNECT'?'MAIL_RECONNECT':'MAIL_CHECK_FAILED';await pool.query("UPDATE ahorra.ahorra_mail_connections SET last_check=now(),next_check=now()+interval '1 hour',last_error=$3,lease_token=NULL,lease_until=NULL WHERE user_id=$1 AND lease_token=$2",[c.user_id,token,code]);}
      }
    }finally{active=false;}
  }
  function kick(){tick().catch(()=>console.error('No se pudo completar la revisión de correo.'));}
  async function check(userId){
    const {rows}=await pool.query("UPDATE ahorra.ahorra_mail_connections SET next_check=now() WHERE user_id=$1 AND enabled=true AND (lease_until IS NULL OR lease_until<now()) AND (last_check IS NULL OR last_check<now()-interval '1 minute') RETURNING user_id",[userId]);
    if(!rows.length)throw fail('MAIL_WAIT',409);
    if(synchronous){await tick({userId,maxAccounts:1});return {queued:false,completed:true};}
    kick();return {queued:true};
  }
  async function review(userId,id,action){
    if(!['apply','dismiss'].includes(action)||!/^[0-9a-f-]{36}$/.test(id))throw fail('MAIL_INVALID_SETTINGS');
    const client=await pool.connect();try{await client.query('BEGIN');
      // Same lock order as ingestion: connection, wallet, event. Also works after disconnect.
      await client.query('SELECT user_id FROM ahorra.ahorra_mail_connections WHERE user_id=$1 FOR UPDATE',[userId]);
      await client.query('SELECT user_id FROM ahorra.ahorra_wallets WHERE user_id=$1 FOR UPDATE',[userId]);
      const {rows:[event]}=await client.query('SELECT * FROM ahorra.ahorra_mail_events WHERE user_id=$1 AND id=$2 FOR UPDATE',[userId,id]);
      if(!event)throw fail('NOT_FOUND',404);if(event.status!=='pending')throw fail('CONFLICT',409);
      if(action==='dismiss')await client.query("UPDATE ahorra.ahorra_mail_events SET status='dismissed' WHERE id=$1",[id]);
      else{const issue=await addMovement(client,userId,event,{manual:true});if(issue)throw fail('MAIL_'+issue,409);}
      await client.query('COMMIT');
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}return status(userId);
  }
  return {status,connect,settings,disconnect,check,review,tick,preview(input){let config;try{config=validateMailSettings(input);}catch{throw fail('MAIL_INVALID_SETTINGS');}const preview=parseBankMail({subject:input.subject||'',text:String(input.text||'').slice(0,100000),from:{value:[{address:config.senders[0]}]}},config,new Date());return {preview};},start(){stopped=false;timer=setInterval(kick,60000);timer.unref();kick();},stop(){stopped=true;clearInterval(timer);}};
}
