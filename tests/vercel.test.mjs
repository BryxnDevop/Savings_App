import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { createVercelHandler, deploymentOrigins } from '../server/vercel-runtime.mjs';
import { embeddedPool } from './helpers/embedded-pool.mjs';
import { migrate, readWallet } from '../server/db.mjs';
import { connectionOptions } from '../server/connection.mjs';
import { emptyLedger } from '../src/lib/ledger.js';
import { readFile } from 'node:fs/promises';

const host='ahorra-fixture.vercel.app',origin='https://'+host;
const env={VERCEL:'1',VERCEL_URL:host,MAIL_ENCRYPTION_KEY:'b'.repeat(64),CRON_SECRET:'test-job-key-'.repeat(4)};
test('Vercel: dominio confiable, pool de transacciones y certificado por variable',()=>{
 assert.deepEqual(deploymentOrigins(env),[origin]);
 assert.throws(()=>deploymentOrigins({...env,APP_ORIGIN:'http://localhost:4173'}));
 const cfg=connectionOptions('postgresql://postgres.test:test@pooler.example:6543/postgres',{VERCEL:'1',DB_SSL_CA_CERT:'line1\\nline2'});
 assert.equal(cfg.max,2);assert.equal(cfg.ssl.rejectUnauthorized,true);assert.equal(cfg.ssl.ca,'line1\nline2');
});
test('Vercel: rewrite real, cuerpo parseado, registro/login, cookies HTTPS y persistencia',async()=>{
 const pool=await embeddedPool();let server;
 try{
  await migrate(pool);let handler;let scans=0;
  const transport={async connect(){return{mailbox:'All Mail',uidValidity:'1',lastUid:0};},async scan(c,p,consume,timeout){assert.equal(timeout,40000);await new Promise(r=>setTimeout(r,10));scans++;return{lastUid:Number(c.last_uid),more:false};}};
  const fresh=()=>createVercelHandler({env,poolFactory:()=>pool,transport});handler=fresh();
  server=createServer(async(req,res)=>{
   // Match Vercel's rewrite and its request.body helper; test with a consumed stream.
   const path=new URL(req.url,'http://local').pathname.slice('/api/'.length);
   req.url='/api/index?__route='+encodeURIComponent(path);
   if(!['GET','HEAD'].includes(req.method)) {const chunks=[];for await(const chunk of req)chunks.push(chunk);const raw=Buffer.concat(chunks).toString();try{req.body=JSON.parse(raw);}catch{req.body=raw;}}
   await handler(req,res);
  });server.listen(0,'127.0.0.1');await once(server,'listening');const address='http://127.0.0.1:'+server.address().port;
  async function call(path,method='GET',body,cookie='',extra={}){
   return new Promise((resolve,reject)=>{
    const req=httpRequest(address+'/api'+path,{method,headers:{Host:host,Origin:origin,'X-Ahorra-Request':'1',...(body!==undefined?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...extra}},res=>{
     const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:{get(key){const v=res.headers[key];return Array.isArray(v)?v.join(', '):v??null;}},body:JSON.parse(Buffer.concat(chunks).toString())}));
    });req.on('error',reject);req.end(body!==undefined?(typeof body==='string'?body:JSON.stringify(body)):undefined);
   });
  }

  const health=await call('/health');assert.equal(health.status,200,JSON.stringify(health.body));assert.equal(health.body.storage,'supabase');
  const input={email:'vercel@test.invalid',password:'Safe-passphrase-987',name:'Bryan',language:'es'};
  const registered=await call('/auth/register','POST',input);assert.equal(registered.status,201);assert.equal(registered.headers.get('set-cookie'),null);assert.equal((await call('/state')).status,401);
  assert.equal((await pool.query('SELECT * FROM ahorra.ahorra_sessions')).rows.length,0);
  const logged=await call('/auth/login','POST',input);assert.equal(logged.status,200);const cookie=logged.headers.get('set-cookie').split(';')[0];assert.match(logged.headers.get('set-cookie'),/Secure/);assert.match(logged.headers.get('set-cookie'),/HttpOnly/);
  const ledger={...emptyLedger(),currency:'DOP',movements:[{id:'salary',type:'income',amountCents:500000,currency:'DOP',reason:'Presupuesto',category:'savings',date:'2026-09-01',note:''}]};
  assert.equal((await call('/state','PUT',{revision:0,ledger},cookie)).status,200);
  handler=fresh();assert.equal((await call('/state','GET',undefined,cookie)).body.ledger.movements[0].amountCents,500000,'cold instance retains DB session and data');
  assert.equal((await call('/state','PUT',{revision:1,ledger},cookie,{Origin:'https://evil.example'})).status,403);
  assert.equal((await call('/profile','PATCH','{invalid',cookie)).status,400);
  assert.equal((await call('/auth/register','POST',input)).status,409);
  const today=(await call('/recurring','GET',undefined,cookie)).body.today;
  assert.equal((await call('/recurring','POST',{name:'Internet',amountCents:250000,currency:'DOP',category:'home',frequency:'monthly',nextDue:today},cookie)).status,201);
  await call('/state','GET',undefined,cookie);
  assert.equal((await readWallet(pool,registered.body.user.id)).ledger.movements.length,2,'GET state catches up due payments without an interval');
  assert.equal((await call('/jobs')).status,401);
  const jobs=await call('/jobs','GET',undefined,'',{Authorization:'Bearer '+env.CRON_SECRET});assert.equal(jobs.status,200);
  assert.equal((await readWallet(pool,registered.body.user.id)).ledger.movements.length,2,'job does not repeat a paid occurrence');
  const mail={email:'owner@gmail.com',password:'abcdabcdabcdabcd',senders:'alertas@bank.example',amountLabel:'Monto',expenseWord:'Consumo',incomeWord:'Depósito',referenceLabel:'Referencia',decimal:'.',automatic:false};
  assert.equal((await call('/mail/connect','POST',mail,cookie)).status,200);
  const checked=await call('/mail/check','POST',{},cookie);assert.equal(checked.status,202);assert.equal(checked.body.completed,true);assert.equal(scans,1,'scan completes before response, not a detached promise');
  const status=await call('/mail','GET',undefined,cookie);assert.ok(status.body.connection.last_check);
  assert.equal((await call('/auth/logout','POST',{},cookie)).status,200);assert.equal((await call('/state','GET',undefined,cookie)).status,401);
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await pool.end();}
});
test('Vercel: errores de configuración JSON y cron protegido antes de abrir la base',async()=>{
 const handler=createVercelHandler({env:{...env,DATABASE_URL:''}});
 async function request(path,headers={}){let status,payload;const res={writeHead(s){status=s;},end(body){payload=JSON.parse(body);}};await handler({url:path,method:'GET',headers:{host,...headers}},res);return{status,payload};}
 assert.deepEqual(await request('/api/jobs'),{status:401,payload:{error:'UNAUTHORIZED'}});
 assert.deepEqual(await request('/api/health'),{status:503,payload:{error:'SERVER_CONFIGURATION'}});
});
test('Vercel: configuración incluye función API, caché privada y cron diario compatible con Hobby',async()=>{
 const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url)));
 assert.equal(config.outputDirectory,'dist');assert.ok(config.functions['api/index.js']);
 assert.ok(config.rewrites.some(r=>r.source==='/api/:path*'&&r.destination.startsWith('/api/index')));assert.deepEqual(config.crons,[{path:'/api/jobs',schedule:'0 12 * * *'}]);
 const entry=await readFile(new URL('../api/index.js',import.meta.url),'utf8');assert.match(entry,/attachDatabasePool/);
});
