import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { JSDOM, VirtualConsole } from 'jsdom';
import { embeddedPool } from './helpers/embedded-pool.mjs';
import { migrate } from '../server/db.mjs';
import { createRecurringService } from '../server/recurring.mjs';
import { createMailService } from '../server/mail.mjs';
import { createApi } from '../server/api.mjs';
import { emptyLedger } from '../src/lib/ledger.js';
let server,pool,origin,bundle,recurringService;
before(async()=>{
 pool=await embeddedPool();await migrate(pool);let handle;
 server=createServer((req,res)=>handle(req,res));server.listen(0,'127.0.0.1');await once(server,'listening');origin='http://127.0.0.1:'+server.address().port;
 recurringService=createRecurringService(pool);
 handle=createApi(pool,{origins:[origin],recurringService,mailService:createMailService(pool,{key:'c'.repeat(64),transport:{async connect(){return {mailbox:'All Mail',uidValidity:'9',lastUid:1};},async scan(c){return {lastUid:Number(c.last_uid),more:false};}}})});
 const dir=new URL('../dist/assets/',import.meta.url);const file=(await readdir(dir)).find(n=>n.endsWith('.js'));bundle=await readFile(new URL(file,dir),'utf8');
});
after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await pool.end();});
const tick=()=>new Promise(r=>setTimeout(r,30));
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await tick();}assert.ok(fn(),'Timed out waiting for UI');}
async function app({signedIn=true,ledger=emptyLedger(),name='Ana',mobile=false,legacyDialog=false,systemDark=false,storedTheme}={}){
 let cookie='';let blockWrites=false;const errors=[];const email=`ui-${randomUUID()}@test.invalid`;const password='Test-password-safe-724';
 async function request(path,method='GET',body){const response=await fetch(origin+'/api'+path,{method,headers:{Origin:origin,'X-Ahorra-Request':'1',...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return{status:response.status,body:await response.json()};}
 if(signedIn){assert.equal((await request('/auth/register','POST',{email,password,name,language:'es'})).status,201);assert.equal((await request('/auth/login','POST',{email,password})).status,200);assert.equal((await request('/state','PUT',{revision:0,ledger})).status,200);}
 const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',e=>{if(e.type!=='not-implemented')errors.push(e.message);});virtualConsole.on('error',(...a)=>errors.push(a.join(' ')));
 const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:origin,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole,beforeParse(win){
  if(storedTheme)win.localStorage.setItem('ahorra_theme',storedTheme);
  win.matchMedia=()=>({matches:systemDark,addEventListener(){},removeEventListener(){}});win.scrollTo=()=>{};win.AbortSignal=AbortSignal;
  win.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};win.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
  if(legacyDialog){win.HTMLDialogElement.prototype.showModal=undefined;win.HTMLDialogElement.prototype.close=undefined;}
  if(mobile){Object.defineProperty(win,'innerWidth',{value:320});Object.defineProperty(win,'innerHeight',{value:640});const viewport=new win.EventTarget();viewport.height=640;viewport.offsetTop=0;Object.defineProperty(win,'visualViewport',{value:viewport});}
win.URL.createObjectURL=()=> 'blob:test';win.URL.revokeObjectURL=()=>{};
  win.fetch=async(url,options={})=>{if(blockWrites&&options.method==='PUT')throw new Error('offline');const response=await fetch(new URL(url,origin),{...options,headers:{...options.headers,Origin:origin,...(cookie?{Cookie:cookie}:{})}});const set=response.headers.get('set-cookie');if(set)cookie=set.split(';')[0];return response;};
 }});
 dom.window.eval(bundle);await until(()=>!!dom.window.document.querySelector(signedIn?'.workspace':'.auth-shell'));
 const doc=dom.window.document;
 async function click(text){const el=[...doc.querySelectorAll('button,a')].find(e=>e.textContent.trim()===text);assert.ok(el,'Control missing: '+text);assert.notEqual(el.disabled,true,text);el.click();await tick();}
 async function clickSelector(selector){const el=doc.querySelector(selector);assert.ok(el,selector);el.click();await tick();}
 function fill(selector,value){const el=doc.querySelector(selector);assert.ok(el,selector);const proto=el.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new dom.window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));}
 async function submit(selector='dialog form'){const form=doc.querySelector(selector);assert.ok(form,selector);form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await tick();}
 return{dom,doc,click,clickSelector,fill,submit,request,errors,email,password,setBlock:v=>{blockWrites=v;}};
}

test('Interfaz compilada: crear cuenta, cerrar sesión y volver a iniciar sin exponer el historial',async()=>{
 const a=await app({signedIn:false});try{
  await a.click('Crear una cuenta');a.fill('input[name=name]','Nueva cuenta');a.fill('input[name=email]',a.email);a.fill('input[name=password]',a.password);a.fill('input[name=confirm]',a.password);await a.submit('.auth-shell form');await until(()=>!!a.doc.querySelector('.auth-success'));assert.equal(a.doc.querySelector('.workspace'),null);assert.equal((await a.request('/state')).status,401);assert.equal(a.doc.querySelector('input[name=email]').value,a.email);assert.equal(a.doc.querySelector('input[name=password]').value,'');a.fill('input[name=password]',a.password);await a.submit('.auth-shell form');await until(()=>!!a.doc.querySelector('.workspace'));
  await a.click('Ajustes');await a.click('Cerrar sesión');await until(()=>!!a.doc.querySelector('.auth-shell'));assert.equal(a.doc.querySelector('.balance-value'),null);
  a.fill('input[name=email]',a.email);a.fill('input[name=password]',a.password);await a.submit('.auth-shell form');await until(()=>!!a.doc.querySelector('.workspace'));assert.match(a.doc.body.textContent,/Nueva cuenta/i);assert.deepEqual(a.errors,[]);
 }finally{a.dom.window.close();}
});
test('Interfaz: ingreso de 150 USD, conversión a DOP, registro por quincenas y guardado en SQL',async()=>{
 const a=await app();try{
  await a.click('Nuevo movimiento');a.fill('input[name=amount]','150');a.fill('input[name=reason]','Salario abril');a.fill('input[name=date]','2026-04-15');await a.submit();await until(()=>!a.doc.querySelector('dialog'));
  assert.equal((await a.request('/state')).body.ledger.movements[0].amountCents,15000);
  await a.click('Ajustes');await a.click('Cambiar moneda y tasas');a.fill('dialog select','DOP');await tick();assert.match(a.doc.querySelector('.rate-preview').textContent,/8,865/);await a.submit();await until(()=>!a.doc.querySelector('dialog'));
  const state=(await a.request('/state')).body;assert.equal(state.ledger.currency,'DOP');assert.equal(state.ledger.movements[0].currency,'USD');assert.equal(state.ledger.movements[0].amountCents,15000);
  await a.click('Registro mensual');const monthButton=[...a.doc.querySelectorAll('.month-grid button')].find(b=>b.querySelector('strong').textContent==='abril');assert.ok(monthButton);monthButton.click();await tick();assert.match(a.doc.querySelectorAll('.fortnight-panel')[0].textContent,/Salario abril/);assert.match(a.doc.querySelectorAll('.fortnight-panel')[0].textContent,/8,865/);assert.doesNotMatch(a.doc.querySelectorAll('.fortnight-panel')[1].textContent,/Salario abril/);assert.match(a.doc.querySelectorAll('.fortnight-panel')[1].textContent,/16 al 30/);
  assert.deepEqual(a.errors,[]);
 }finally{a.dom.window.close();}
});
test('Interfaz: perfil e idioma inglés/español persistidos en la cuenta',async()=>{
 const a=await app();try{
  await a.click('Ajustes');a.fill('input[name=profileName]','Ana María');const form=a.doc.querySelector('input[name=profileName]').closest('form');form.dispatchEvent(new a.dom.window.Event('submit',{bubbles:true,cancelable:true}));await until(()=>a.doc.body.textContent.includes('Perfil actualizado.'));assert.equal((await a.request('/auth/me')).body.user.name,'Ana María');
  const language=[...a.doc.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='en'));assert.ok(language);Object.getOwnPropertyDescriptor(a.dom.window.HTMLSelectElement.prototype,'value').set.call(language,'en');language.dispatchEvent(new a.dom.window.Event('change',{bubbles:true}));await until(()=>a.doc.documentElement.lang==='en');assert.match(a.doc.body.textContent,/Your space, your way/);assert.match(a.doc.body.textContent,/My account/);assert.match(a.doc.body.textContent,/Sign out/);assert.equal((await a.request('/auth/me')).body.user.language,'en');
  await a.click('Overview');assert.match(a.doc.body.textContent,/Watch your savings grow/);assert.match(a.doc.body.textContent,/Create my first goal/);
  assert.deepEqual(a.errors,[]);
 }finally{a.dom.window.close();}
});
test('Interfaz: un conflicto y una conexión caída no se muestran como guardado correcto',async()=>{
 const a=await app();try{
  await a.click('Nuevo movimiento');a.fill('input[name=amount]','40');a.fill('input[name=reason]','Pendiente');const current=(await a.request('/state')).body;await a.request('/state','PUT',{revision:current.revision,ledger:{...current.ledger,currency:'EUR'}});await a.submit();await until(()=>a.doc.querySelector('dialog [role=alert]'));assert.match(a.doc.querySelector('dialog [role=alert]').textContent,/otra ventana/);assert.equal((await a.request('/state')).body.ledger.movements.length,0);
  await a.click('Cancelar');await a.click('Nuevo movimiento');a.fill('input[name=amount]','40');a.fill('input[name=reason]','Sin conexión');a.setBlock(true);await a.submit();await until(()=>a.doc.querySelector('dialog [role=alert]'));assert.match(a.doc.querySelector('dialog [role=alert]').textContent,/no está confirmado/);assert.equal((await a.request('/state')).body.ledger.movements.length,0);assert.doesNotMatch(a.doc.body.textContent,/Movimiento guardado en Supabase/);assert.deepEqual(a.errors,[]);
 }finally{a.dom.window.close();}
});

test('Interfaz: foto abre panel de cuenta, guarda perfil y cambia apariencia sin salir del resumen',async()=>{
 const a=await app();try{
  await a.clickSelector('.profile-button');await until(()=>!!a.doc.querySelector('.account-drawer'));
  assert.equal(a.dom.window.location.hash,'');assert.equal(a.doc.querySelector('.profile-button').getAttribute('aria-expanded'),'true');
  a.fill('.account-drawer input[name=profileName]','Mi perfil');await a.submit('.account-drawer form');await until(()=>a.doc.body.textContent.includes('Perfil actualizado.'));assert.equal((await a.request('/auth/me')).body.user.name,'Mi perfil');assert.equal(a.doc.querySelector('.profile-name').textContent,'Mi perfil');
  await a.click('Oscuro');assert.equal(a.doc.documentElement.dataset.theme,'dark');assert.equal(a.dom.window.localStorage.getItem('ahorra_theme'),'dark');
  await a.click('Claro');assert.equal(a.doc.documentElement.dataset.theme,'light');
  await a.click('Oscuro');await a.clickSelector('.account-drawer [aria-label="Cerrar ventana"]');assert.equal(a.doc.querySelector('.account-drawer'),null);assert.equal(a.doc.documentElement.dataset.theme,'dark');assert.deepEqual(a.errors,[]);
 }finally{a.dom.window.close();}
});
test('Interfaz: configura Gmail, prueba un aviso sin cambiar saldo y desconecta',async()=>{
 const a=await app();try{
  await a.click('Ajustes');await until(()=>!a.doc.querySelector('#bank-mail button[type=submit]')&&a.doc.querySelector('#bank-mail input[name=gmailEmail]'));
  await until(()=>[...a.doc.querySelectorAll('button')].some(b=>b.textContent==='Conectar Gmail'&&!b.disabled));
  a.fill('input[name=gmailEmail]','owner@gmail.com');a.fill('input[name=gmailAppPassword]','abcd abcd abcd abcd');a.fill('textarea[name=bankSenders]','alertas@banco.example');
  const toggles=a.doc.querySelectorAll('#bank-mail .toggle-row input');toggles[1].click();await tick();await a.submit('#bank-mail form');await until(()=>a.doc.querySelector('.mail-status').textContent==='Conectado');
  assert.equal(a.doc.querySelector('input[name=gmailAppPassword]'),null);const status=(await a.request('/mail')).body;assert.equal(status.connection.settings.email,'owner@gmail.com');assert.equal(status.connection.settings.automatic,false);assert.ok(!JSON.stringify(status).includes('abcd'));
  a.fill('textarea[aria-label="Texto del aviso"]','Consumo aprobado\nMonto: DOP 1,250.00\nReferencia: ABC12345');await tick();await a.click('Interpretar ejemplo');await until(()=>!!a.doc.querySelector('.sample-result'));assert.match(a.doc.querySelector('.sample-result').textContent,/1,250/);assert.equal((await a.request('/state')).body.ledger.movements.length,0);
  await a.click('Desconectar Gmail');await a.click('Confirmar desconexión');await until(()=>a.doc.querySelector('.mail-status').textContent==='Sin conectar');assert.equal((await a.request('/mail')).body.connection,null);assert.deepEqual(a.errors,[]);
 }finally{a.dom.window.close();}
});


test('Móvil: nombre largo, ajustes y panel respetan teclado y restauran el desplazamiento',async()=>{
 const name='María Alejandra de los Santos Fernández';
 const a=await app({name,mobile:true});try{
  assert.equal(a.doc.querySelector('.profile-name').textContent,name);
  await a.click('Ajustes');assert.equal(a.doc.querySelector('.fatal-error'),null);
  a.doc.querySelector('.profile-button').focus();await a.clickSelector('.profile-button');const dialog=a.doc.querySelector('.account-drawer');assert.ok(dialog);
  assert.equal(dialog.parentElement,a.doc.body,'panel outside inert application root');
  assert.equal(a.doc.getElementById('root').getAttribute('aria-hidden'),'true');assert.equal(a.doc.body.style.position,'fixed');
  assert.equal(dialog.style.getPropertyValue('--dialog-height'),'640px');
  a.dom.window.visualViewport.height=360;a.dom.window.visualViewport.dispatchEvent(new a.dom.window.Event('resize'));
  assert.equal(dialog.style.getPropertyValue('--dialog-height'),'360px');assert.equal(dialog.style.getPropertyValue('--dialog-bottom'),'280px');
  await a.clickSelector('.account-drawer .modal-close');assert.equal(a.doc.body.style.position,'');assert.equal(a.doc.body.style.overflow,'');assert.equal(a.doc.getElementById('root').hasAttribute('aria-hidden'),false);assert.ok(a.doc.activeElement===a.doc.querySelector('.profile-button'),'Focus returns to the profile button');
  await a.clickSelector('.profile-button');assert.ok(a.doc.querySelector('.account-drawer'));await a.clickSelector('.account-drawer .modal-close');assert.deepEqual(a.errors,[]);
 }finally{a.dom.window.close();}
});
test('Móvil sin showModal: abre cuenta con alternativa accesible y cierra con Escape',async()=>{
 const a=await app({mobile:true,legacyDialog:true});try{
  await a.click('Ajustes');await a.clickSelector('.profile-button');await until(()=>!!a.doc.querySelector('[data-modal-fallback]'));
  assert.ok(a.doc.querySelector('.modal-fallback-backdrop'));assert.equal(a.doc.querySelector('dialog').getAttribute('aria-modal'),'true');assert.equal(a.doc.querySelector('.fatal-error'),null);
  a.doc.dispatchEvent(new a.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await until(()=>!a.doc.querySelector('dialog'));assert.equal(a.doc.querySelector('.modal-fallback-backdrop'),null);assert.equal(a.doc.body.style.overflow,'');
  await a.clickSelector('.profile-button');await until(()=>!!a.doc.querySelector('.modal-fallback-backdrop'));await a.clickSelector('.modal-fallback-backdrop');assert.equal(a.doc.querySelector('dialog'),null);assert.deepEqual(a.errors,[]);
 }finally{a.dom.window.close();}
});


test('Interfaz: crea pago recurrente, genera un gasto y actualiza saldo al volver a la app',async()=>{
 const ledger={...emptyLedger(),currency:'DOP',movements:[{id:'fund',type:'income',amountCents:500000,currency:'DOP',category:'savings',date:'2026-01-01',reason:'Presupuesto',note:''}]};
 const a=await app({ledger,mobile:true});try{
  await a.click('Pagos fijos');await until(()=>[...a.doc.querySelectorAll('button')].some(b=>b.textContent==='Nuevo pago recurrente'&&!b.disabled));
  await a.click('Nuevo pago recurrente');a.fill('dialog input[name=name]','Netflix');a.fill('dialog input[name=amount]','600');await a.submit();await until(()=>!a.doc.querySelector('dialog'));
  await until(()=>a.doc.querySelector('.recurring-card h2')?.textContent==='Netflix');assert.equal((await a.request('/recurring')).body.items[0].amountCents,60000);
  await until(()=>!a.doc.querySelector('.connection').textContent.includes('Guardando'));
  await recurringService.tick();a.dom.window.dispatchEvent(new a.dom.window.Event('focus'));await tick();
  await a.click('Resumen');await until(()=>a.doc.querySelector('.balance-value')?.textContent.includes('4,400'));assert.equal((await a.request('/state')).body.ledger.movements.length,2);
  await until(()=>!!a.doc.querySelector('.notification-count'));await a.clickSelector('.notification-button');await until(()=>a.doc.querySelector('.notification-list')?.textContent.includes('Se registró el pago de Netflix'));
  await a.clickSelector('.notification-drawer .modal-close');await a.click('Pagos fijos');await a.click('Pausar');await a.click('Confirmar');await until(()=>!a.doc.querySelector('dialog'));await until(()=>a.doc.querySelector('.payment-state').textContent==='Pausado');assert.deepEqual(a.errors,[]);
 }finally{a.dom.window.close();}
});
test('Interfaz: saldo bajo de RD$200 reaparece al iniciar sesión aunque los avisos se hayan leído',async()=>{
 const row={currency:'DOP',category:'other',date:'2026-01-01',reason:'Movimiento',note:''};
 const a=await app({ledger:{...emptyLedger(),currency:'DOP',movements:[{...row,id:'in',type:'income',amountCents:500000},{...row,id:'out',type:'expense',amountCents:480000}]}});try{
  assert.match(a.doc.querySelector('.low-balance-alert').textContent,/200/);await until(()=>!!a.doc.querySelector('.notification-count'));
  await a.clickSelector('.notification-button');await until(()=>a.doc.querySelector('.notification-list')?.textContent.includes('96%'));await a.click('Marcar todas como leídas');await until(()=>a.doc.querySelector('.notification-toolbar').textContent.includes('0 sin leer'));await a.clickSelector('.notification-drawer .modal-close');assert.ok(a.doc.querySelector('.low-balance-alert'));
  await a.click('Ajustes');await a.click('Cerrar sesión');await until(()=>!!a.doc.querySelector('.auth-shell'));a.fill('input[name=email]',a.email);a.fill('input[name=password]',a.password);await a.submit('.auth-shell form');await until(()=>!!a.doc.querySelector('.workspace'));assert.match(a.doc.querySelector('.low-balance-alert').textContent,/200/);assert.equal((await a.request('/notifications')).body.unread,0);assert.deepEqual(a.errors,[]);
 }finally{a.dom.window.close();}
});

test('Móvil: foto → Cambiar moneda convierte y guarda sin superponer paneles',async()=>{
 const a=await app({mobile:true,ledger:{...emptyLedger(),movements:[{id:'currency-test',type:'income',amountCents:15000,currency:'USD',date:'2026-09-01',reason:'Ingreso',category:'savings',note:''}]}});try{
  await a.clickSelector('.profile-button');await a.clickSelector('.account-drawer [aria-label="Cambiar moneda"]');
  assert.equal(a.doc.querySelector('.account-drawer'),null);assert.equal(a.doc.querySelectorAll('dialog').length,1);assert.ok(a.doc.querySelector('.rate-preview'));assert.equal(a.doc.body.style.position,'fixed');
  a.fill('dialog select','DOP');await tick();assert.match(a.doc.querySelector('.rate-preview').textContent,/8,865/);await a.submit();await until(()=>!a.doc.querySelector('dialog'));
  const saved=(await a.request('/state')).body.ledger;assert.equal(saved.currency,'DOP');assert.equal(saved.movements[0].amountCents,15000);assert.equal(saved.movements[0].currency,'USD');assert.equal(a.doc.body.style.position,'');assert.equal(a.doc.getElementById('root').hasAttribute('aria-hidden'),false);
  await a.clickSelector('.profile-button');assert.match(a.doc.querySelector('[aria-label="Cambiar moneda"]').textContent,/DOP/);await a.clickSelector('.account-drawer .modal-close');assert.equal(a.doc.querySelector('.fatal-error'),null);assert.deepEqual(a.errors,[]);
 }finally{a.dom.window.close();}
});

test('Tema: inicio blanco aunque el sistema o la preferencia anterior sean oscuros',async()=>{
 for(const storedTheme of [undefined,'dark','system']) {
  const a=await app({signedIn:false,systemDark:true,storedTheme});try{
   assert.equal(a.doc.documentElement.dataset.theme,'light');
   assert.equal(a.doc.documentElement.style.colorScheme,'light');
   await a.click('Crear una cuenta');assert.equal(a.doc.documentElement.dataset.theme,'light');
  }finally{a.dom.window.close();}
 }
});
test('Tema: dashboard claro por defecto, oscuro opcional y login blanco al salir',async()=>{
 const a=await app({systemDark:true});try{
  assert.equal(a.doc.documentElement.dataset.theme,'light');await a.clickSelector('.profile-button');await a.click('Oscuro');assert.equal(a.doc.documentElement.dataset.theme,'dark');
  await a.click('Cerrar sesión');await until(()=>!!a.doc.querySelector('.auth-shell'));assert.equal(a.doc.documentElement.dataset.theme,'light');assert.equal(a.dom.window.localStorage.getItem('ahorra_theme'),'dark');
 }finally{a.dom.window.close();}
});
