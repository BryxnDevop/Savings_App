import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';
import { generateVapidKeys, sendWebPush, validateVapid } from '../server/web-push-protocol.mjs';

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
