import { timingSafeEqual } from 'node:crypto';
import { createApi, send } from './api.mjs';
import { createPool, checkSchema } from './db.mjs';
import { createMailService } from './mail.mjs';
import { createRecurringService } from './recurring.mjs';
import { gmailTransport } from './gmail.mjs';

export function deploymentOrigins(env) {
  const values = [env.APP_ORIGIN, ...[env.VERCEL_PROJECT_PRODUCTION_URL,env.VERCEL_URL,env.VERCEL_BRANCH_URL].filter(Boolean).map(host=>'https://'+host)].filter(Boolean);
  if(!values.length)throw Object.assign(new Error('Missing origin'),{code:'DB_CONFIG'});
  return [...new Set(values.map(value=>{
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Object.assign(new Error('Invalid public origin'),{code:'DB_CONFIG'});
    return url.origin;
  }))];
}
export function routeRequest(req) {
  const url=new URL(req.url,'https://local.invalid');
  if(url.pathname==='/api/index') {
    const route=url.searchParams.get('__route');
    if(!route||!/^[-a-zA-Z0-9/]+$/.test(route))return '/api/not-found';
    return '/api/'+route;
  }
  return url.pathname;
}
function authorizedJob(req,secret) {
  if(!secret || secret.length<32)return false;
  const expected=Buffer.from('Bearer '+secret);const actual=Buffer.from(req.headers.authorization||'');
  return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
// Injection points exercise the production handler with a real SQL engine in tests.
export function createVercelHandler({env=process.env,poolFactory=createPool,attachPool=()=>{},transport=gmailTransport}={}) {
  let ready;
  async function initialize() {
    const origins=deploymentOrigins(env);
    const pool=poolFactory(env.DATABASE_URL,env);attachPool(pool);
    try {
      await checkSchema(pool);
      const mail=createMailService(pool,{key:env.MAIL_ENCRYPTION_KEY,synchronous:true,transport:{...transport,scan:(...args)=>transport.scan(...args,40000)}});
      const recurring=createRecurringService(pool,{timeZone:env.APP_TIME_ZONE||'America/Santo_Domingo'});
      const api=createApi(pool,{origins,mailService:mail,recurringService:recurring,serverless:true,requestIp:req=>req.headers['x-vercel-forwarded-for']?.split(',')[0]?.trim()||req.socket?.remoteAddress||'unknown'});
      return {pool,mail,recurring,api};
    } catch(e){await pool.end();throw e;}
  }
  return async function handler(req,res) {
    req.url=routeRequest(req);
    if(req.url==='/api/jobs') {
      if(!['GET','POST'].includes(req.method)){send(res,405,{error:'METHOD_NOT_ALLOWED'},{Allow:'GET, POST'});return;}
      if(!authorizedJob(req,env.CRON_SECRET)){send(res,401,{error:'UNAUTHORIZED'});return;}
    }
    try {
      if(!ready)ready=initialize().catch(e=>{ready=undefined;throw e;});
      const runtime=await ready;
      if(req.url==='/api/jobs') {
        // Keep work bounded; unprocessed rows stay due for the next invocation.
        await runtime.recurring.tick({maxBatches:2,batchSize:50,deadline:Date.now()+20000});
        await runtime.mail.tick({maxAccounts:3,deadline:Date.now()+150000});
        send(res,200,{ok:true,checkedAt:new Date().toISOString()});return;
      }
      if(!await runtime.api(req,res))send(res,404,{error:'NOT_FOUND'});
    } catch(e) {
      const code=e.code==='DB_CONFIG'?'SERVER_CONFIGURATION':e.code==='MIGRATION_REQUIRED'?'MIGRATION_REQUIRED':'DATABASE_UNAVAILABLE';
      console.error('Ahorra+ API:',e.code||'INITIALIZATION_ERROR');
      if(!res.headersSent)send(res,503,{error:code});
    }
  };
}
