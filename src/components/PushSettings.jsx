import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Icon } from './Icon';
import { useI18n } from '../lib/i18n';

const KEYS=['recurring','budget','movements','goals','bank','sound'];
const labels={
 recurring:['Pagos recurrentes','Recurring payments'],
 budget:['Presupuesto bajo','Low budget'],
 movements:['Cada movimiento nuevo','Every new movement'],
 goals:['Motivación de metas','Goal motivation'],
 bank:['Movimientos del banco','Bank movements'],
 sound:['Sonido y vibración del sistema','System sound and vibration'],
};
function applicationKey(value){
 const pad='='.repeat((4-value.length%4)%4);const raw=atob((value+pad).replace(/-/g,'+').replace(/_/g,'/'));const out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;
}
export function PushSettings(){
 const {t,error}=useI18n();const [data,setData]=useState(null);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [localSubscribed,setLocalSubscribed]=useState(false);
 const browserSupported=import.meta.env.PROD&&typeof window!=='undefined'&&window.isSecureContext&&'Notification' in window&&'serviceWorker' in navigator&&'PushManager' in window;
 async function load(sync=true){
  try{
   let next=await api('/push');
   if(sync&&browserSupported&&next.configured&&Notification.permission==='granted'){
    const reg=await navigator.serviceWorker.ready;const current=await reg.pushManager.getSubscription();
    setLocalSubscribed(!!current);if(current){next=await api('/push/subscribe',{method:'POST',body:{subscription:current.toJSON(),userAgent:navigator.userAgent}});}
   }
   setData(next);setMessage('');
  }catch(e){setMessage(error(e));}
 }
 useEffect(()=>{load();},[]);
 async function enable(){
  if(!browserSupported){setMessage(t('Este navegador no admite Web Push en este contexto. Usa HTTPS y un navegador compatible.','This browser does not support Web Push in this context. Use HTTPS and a compatible browser.'));return;}
  setBusy(true);setMessage('');
  try{
   if(!data?.configured)throw Object.assign(new Error('PUSH_NOT_CONFIGURED'),{code:'PUSH_NOT_CONFIGURED'});
   const permission=await Notification.requestPermission();if(permission!=='granted')throw Object.assign(new Error('PUSH_PERMISSION_DENIED'),{code:'PUSH_PERMISSION_DENIED'});
   const reg=await navigator.serviceWorker.ready;
   let subscription=await reg.pushManager.getSubscription();
   if(!subscription)subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationKey(data.publicKey)});
   setData(await api('/push/subscribe',{method:'POST',body:{subscription:subscription.toJSON(),userAgent:navigator.userAgent}}));setLocalSubscribed(true);
   setMessage(t('Notificaciones push activadas en este dispositivo.','Push notifications enabled on this device.'));
  }catch(e){setMessage(error(e));}finally{setBusy(false);}
 }
 async function disable(){
  setBusy(true);setMessage('');
  try{
   const reg=await navigator.serviceWorker.ready;const subscription=await reg.pushManager.getSubscription();
   if(subscription){setData(await api('/push/unsubscribe',{method:'POST',body:{endpoint:subscription.endpoint}}));await subscription.unsubscribe();setLocalSubscribed(false);}
   else await load(false);
   setMessage(t('Notificaciones push desactivadas en este dispositivo.','Push notifications disabled on this device.'));
  }catch(e){setMessage(error(e));}finally{setBusy(false);}
 }
 async function change(key,value){
  if(!data)return;const preferences={...data.preferences,[key]:value};setData({...data,preferences});setBusy(true);setMessage('');
  try{setData(await api('/push/preferences',{method:'PUT',body:preferences}));}
  catch(e){setMessage(error(e));await load(false);}finally{setBusy(false);}
 }
 async function testNotification(){
  setBusy(true);setMessage('');
  try{
   if(Notification.permission!=='granted')throw Object.assign(new Error('PUSH_PERMISSION_DENIED'),{code:'PUSH_PERMISSION_DENIED'});
   const reg=await navigator.serviceWorker.ready;await reg.showNotification('Ahorra+',{body:t('Tus notificaciones están funcionando correctamente.','Your notifications are working correctly.'),icon:'./icons/icon-192.png',badge:'./icons/icon-192.png',tag:'ahorra-test',renotify:true,silent:data?.preferences?.sound===false,...(data?.preferences?.sound===false?{}:{vibrate:[160,80,160]}),data:{url:'./#resumen'}});
  }catch(e){setMessage(error(e));}finally{setBusy(false);}
 }
 const active=localSubscribed&&browserSupported&&Notification.permission==='granted';
 return <section className="panel settings-panel push-settings"><div className="settings-title"><span className="icon-tile green"><Icon name="bell"/></span><div><h2>{t('Notificaciones push','Push notifications')}</h2><p>{t('Avisos importantes incluso cuando Ahorra+ está cerrada.','Important alerts even when Ahorra+ is closed.')}</p></div></div>
  {!browserSupported&&<p className="form-error">{t('Web Push requiere HTTPS y un navegador compatible.','Web Push requires HTTPS and a compatible browser.')}</p>}
  {data&&!data.configured&&<p className="form-error">{t('Faltan VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY en Vercel. La app funciona, pero el push todavía no puede activarse.','VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are missing in Vercel. The app works, but push cannot be enabled yet.')}</p>}
  <div className={`push-status ${active?'is-active':''}`}><span/><div><strong>{active?t('Push activado','Push enabled'):t('Push desactivado','Push disabled')}</strong><small>{active?t('Este dispositivo recibirá avisos según tus preferencias.','This device will receive alerts based on your preferences.'):t('Actívalo una vez y acepta el permiso del navegador.','Enable it once and accept the browser permission.')}</small></div></div>
  <div className="settings-buttons"><button className="button primary" disabled={busy||!data?.configured||!browserSupported||active} onClick={enable}>{busy?t('Procesando…','Working…'):t('Activar notificaciones','Enable notifications')}</button><button className="button secondary" disabled={busy||!active} onClick={disable}>{t('Desactivar en este dispositivo','Disable on this device')}</button></div>
  <div className="settings-divider"/>
  <div className="push-preferences"><h3>{t('Quiero recibir avisos de','Notify me about')}</h3>{KEYS.map(key=><label className="push-toggle" key={key}><span><strong>{t(...labels[key])}</strong>{key==='recurring'&&<small>{t('Te avisaremos desde 2 días antes del próximo pago.','We will alert you starting 2 days before the next payment.')}</small>}{key==='sound'&&<small>{t('Se usa el sonido predeterminado del sistema y una vibración suave cuando el dispositivo lo permite.','Uses the system default sound and a gentle vibration when the device allows it.')}</small>}</span><input type="checkbox" checked={data?.preferences?.[key]??true} disabled={busy||!data} onChange={e=>change(key,e.target.checked)}/></label>)}</div>
  {active&&<button className="text-button push-test" disabled={busy} onClick={testNotification}><Icon name="bell" size={15}/>{t('Probar notificación en este dispositivo','Test notification on this device')}</button>}
  {message&&<p className={message.includes('activad')||message.includes('enabled')?'hint':'form-error'} role="status">{message}</p>}
  <p className="hint">{t('En iPhone/iPad, instala Ahorra+ en la pantalla de inicio para obtener la mejor compatibilidad con notificaciones. El sonido final depende de la configuración del sistema operativo.','On iPhone/iPad, install Ahorra+ on the Home Screen for the best notification support. Final sound behavior depends on the operating system settings.')}</p>
 </section>;
}
