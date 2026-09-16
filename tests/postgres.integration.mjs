import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createPool,migrate } from '../server/db.mjs';
import { createApi } from '../server/api.mjs';
import { emptyLedger } from '../src/lib/ledger.js';

if(!process.env.TEST_DATABASE_URL && !process.env.TEST_PGLITE)throw new Error('TEST_DATABASE_URL debe apuntar a una base PostgreSQL de pruebas.');
test('API + SQL: cuentas, sesiones, aislamiento, perfil, revisión concurrente, monedas y persistencia',async()=>{
  const pool=process.env.TEST_PGLITE ? await (await import('./helpers/embedded-pool.mjs')).embeddedPool() : createPool(process.env.TEST_DATABASE_URL);await migrate(pool);let server;let origin;let handle;const ids=[];
  async function start(){server=createServer((req,res)=>handle(req,res));server.listen(0,'127.0.0.1');await once(server,'listening');origin='http://127.0.0.1:'+server.address().port;handle=createApi(pool,{origins:[origin],rateFetch:async()=>({ok:true,json:async()=>({result:'success',base_code:'USD',time_last_update_unix:1789430400,rates:{USD:1,DOP:59.1,EUR:.92,MXN:18.5,COP:4000}})})});}
  async function stop(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  function client(){let cookie='';return {get cookie(){return cookie;},async request(path,method='GET',data,extra={}){const response=await fetch(origin+'/api'+path,{method,headers:{Origin:origin,'X-Ahorra-Request':'1',...(data?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...extra},body:data?JSON.stringify(data):undefined});const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return{status:response.status,body:await response.json(),headers:response.headers};}};}
  await start();
  try{
    const a=client(),b=client(),guest=client();
    assert.equal((await guest.request('/state')).status,401);
    const suffix=randomUUID();const emailA=`a-${suffix}@test.invalid`;const emailB=`b-${suffix}@test.invalid`;const password='Very-long-test-password-58';
    const registered=await a.request('/auth/register','POST',{email:emailA,password,name:'Ana',language:'es'});assert.equal(registered.status,201);ids.push(registered.body.user.id);assert.match(registered.headers.get('set-cookie'),/HttpOnly/);assert.match(registered.headers.get('set-cookie'),/SameSite=Strict/);
    const second=await b.request('/auth/register','POST',{email:emailB,password,name:'Ben',language:'en'});assert.equal(second.status,201);ids.push(second.body.user.id);
    const initial=(await a.request('/state')).body;assert.equal(initial.revision,0);assert.equal(initial.ledger.movements.length,0);
    const ledger={...emptyLedger(),currency:'DOP',goal:{name:'Viaje',targetCents:30000,currency:'USD'},movements:[{id:'shared-id',type:'income',amountCents:15000,currency:'USD',reason:"Ahorro ' ; SELECT 1; --",date:'2026-04-15',note:'',category:'savings'}]};
    const saved=await a.request('/state','PUT',{revision:0,ledger});assert.equal(saved.status,200);assert.equal(saved.body.revision,1);
    assert.equal((await b.request('/state')).body.ledger.movements.length,0);
    const isolated=await b.request('/state','PUT',{revision:0,ledger:{...ledger,movements:[{...ledger.movements[0],reason:'De Ben',amountCents:999}]}});assert.equal(isolated.status,200);
    assert.equal((await a.request('/state')).body.ledger.movements[0].amountCents,15000);
    assert.equal((await a.request('/state','PUT',{revision:0,ledger:{...ledger,movements:[]}})).status,409);
    assert.equal((await a.request('/state','PUT',{revision:1,ledger:{...ledger,movements:[{...ledger.movements[0],amountCents:-1}]}})).status,400);
    assert.equal((await a.request('/state')).body.ledger.movements.length,1);
    const quote=await a.request('/rates');assert.equal(quote.status,200);assert.equal(quote.body.rates.DOP,59.1);assert.equal(quote.body.rateInfo.source,'ExchangeRate-API');
    assert.equal((await a.request('/state')).body.ledger.rateInfo.source,'manual');
    const concurrent=await Promise.all([a.request('/state','PUT',{revision:1,ledger}),a.request('/state','PUT',{revision:1,ledger})]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
    const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9N8AAAAASUVORK5CYII=';
    const profile=await a.request('/profile','PATCH',{name:'Ana María',language:'en',avatar:png});assert.equal(profile.status,200);assert.equal(profile.body.user.name,'Ana María');assert.equal(profile.body.user.language,'en');assert.equal(profile.body.user.avatar,png);
    assert.equal((await a.request('/profile','PATCH',{avatar:'data:image/svg+xml;base64,PHN2Zz4='})).status,400);
    assert.equal((await a.request('/profile','PATCH',{name:'Malicious'}, {Origin:'https://evil.invalid'})).status,403);
    const raw=await fetch(origin+'/api/state',{method:'PUT',headers:{Cookie:a.cookie,'Content-Type':'application/json'},body:JSON.stringify({revision:2,ledger})});assert.equal(raw.status,403);
    const {rows:[secret]}=await pool.query('SELECT password_hash FROM ahorra_users WHERE id=$1',[ids[0]]);assert.notEqual(secret.password_hash,password);assert.match(secret.password_hash,/^scrypt:/);
    const token=a.cookie.split('=')[1];const {rows:[session]}=await pool.query('SELECT token_hash FROM ahorra_sessions WHERE user_id=$1',[ids[0]]);assert.notEqual(session.token_hash,token);
    await stop();await start();assert.equal((await a.request('/auth/me')).body.user.name,'Ana María');assert.equal((await a.request('/state')).body.ledger.movements[0].amountCents,15000);
    const parallel=client();assert.equal((await parallel.request('/auth/login','POST',{email:emailA,password})).status,200);
    assert.equal((await a.request('/auth/password','POST',{currentPassword:password,password:'A-new-secure-password-739'})).status,200);
    assert.equal((await parallel.request('/auth/me')).status,401);
    assert.equal((await guest.request('/auth/login','POST',{email:emailA,password})).status,401);
    assert.equal((await guest.request('/auth/login','POST',{email:emailA,password:'A-new-secure-password-739'})).status,200);
    const oldCookie=a.cookie;assert.equal((await a.request('/auth/logout','POST',{})).status,200);
    const expired=await fetch(origin+'/api/state',{headers:{Cookie:oldCookie}});assert.equal(expired.status,401);
    assert.equal((await guest.request('/state')).body.ledger.movements.length,1);
    assert.equal((await b.request('/auth/me')).body.user.name,'Ben');
    console.log('PostgreSQL:',(await pool.query('SELECT version()')).rows[0].version.split(' on ')[0]);
  }finally{await stop();if(ids.length)await pool.query('DELETE FROM ahorra_users WHERE id=ANY($1::uuid[])',[ids]);await pool.end();}
});
