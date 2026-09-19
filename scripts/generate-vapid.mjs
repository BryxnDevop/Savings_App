import { generateVapidKeys } from '../server/web-push-protocol.mjs';
const keys = generateVapidKeys();
console.log('VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
console.log('VAPID_SUBJECT=https://TU-DOMINIO.vercel.app');
