import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';
import { generateVapidKeys, sendWebPush, validateVapid } from '../server/web-push-protocol.mjs';
import { createPushService } from '../server/push.mjs';

test('Web Push: VAPID estable y payload aes128gcm', async () => {
  const vapid={...generateVapidKeys(),subject:'https://ahorra.example'};
  assert.equal(validateVapid(vapid),true);
  const client=createECDH('prime256v1');client.generateKeys();
  const subscription={endpoint:'https://push.example.test/send/abc',keys:{p256dh:client.getPublicKey().toString('base64url'),auth:Buffer.alloc(16,9).toString('base64url')}};
  let request;
  await sendWebPush(subscription,{title:'Ahorra+',body:'Prueba'},vapid,{fetchImpl:async(url,options)=>{request={url,options};return{ok:true,status:201};}});
  assert.equal(request.url,subscription.endpoint);
  assert.equal(request.options.headers['Content-Encoding'],'aes128gcm');
  assert.match(request.options.headers.Authorization,/^vapid t=.+, k=.+$/);
  assert.ok(Buffer.isBuffer(request.options.body));
  assert.ok(request.options.body.length>100);
});


test('Web Push: la prueba del servidor usa una suscripción real y urgencia alta', async () => {
  const vapid={...generateVapidKeys(),subject:'https://ahorra.example'};
  const client=createECDH('prime256v1');client.generateKeys();
  const subscription={id:'sub-1',endpoint:'https://push.example.test/send/test',p256dh:client.getPublicKey().toString('base64url'),auth:Buffer.alloc(16,7).toString('base64url')};
  const requests=[];
  const pool={
    async query(sql){
      if(sql.includes('FROM ahorra.ahorra_notification_preferences'))return {rows:[{sound:true}]};
      if(sql.includes('FROM ahorra.ahorra_push_subscriptions'))return {rows:[subscription]};
      if(sql.includes('SELECT language FROM ahorra.ahorra_users'))return {rows:[{language:'es'}]};
      throw new Error('SQL inesperado: '+sql);
    }
  };
  const service=createPushService(pool,{...vapid,fetchImpl:async(url,options)=>{requests.push({url,options});return {ok:true,status:201};}});
  const result=await service.sendTest('00000000-0000-0000-0000-000000000001',{delaySeconds:0});
  assert.deepEqual(result,{ok:true,sent:1,delaySeconds:0});
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,subscription.endpoint);
  assert.equal(requests[0].options.headers.Urgency,'high');
});
