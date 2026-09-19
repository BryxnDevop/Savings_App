import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

function base64ToBytes(value) {
  const padding='='.repeat((4-value.length%4)%4);
  const base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);
  return Uint8Array.from([...raw].map(char=>char.charCodeAt(0)));
}

export function usePushNotifications(userId) {
  const supported = typeof window !== 'undefined' &&
    'Notification' in window &&
    'PushManager' in window &&
    'serviceWorker' in navigator &&
    window.isSecureContext;
  const [status,setStatus]=useState({configured:false,subscribed:false,loading:true});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  const refresh=useCallback(async()=>{
    if(!supported){setStatus(s=>({...s,loading:false}));return;}
    try{
      const next=await api('/push/status');
      setStatus({...next,loading:false});
      setError('');
    }catch(e){setStatus(s=>({...s,loading:false}));setError(e.code||'PUSH_ERROR');}
  },[supported,userId]);

  useEffect(()=>{refresh();},[refresh]);

  const enable=useCallback(async()=>{
    if(!supported){setError('PUSH_UNSUPPORTED');return false;}
    setBusy(true);setError('');
    try{
      const config=await api('/push/status');
      if(!config.configured||!config.publicKey)throw Object.assign(new Error('PUSH_NOT_CONFIGURED'),{code:'PUSH_NOT_CONFIGURED'});
      const permission=await Notification.requestPermission();
      if(permission!=='granted'){throw Object.assign(new Error('PUSH_PERMISSION_DENIED'),{code:'PUSH_PERMISSION_DENIED'});}
      let registration=await navigator.serviceWorker.getRegistration('./');
      if(!registration) registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
      await navigator.serviceWorker.ready;
      let subscription=await registration.pushManager.getSubscription();
      if(!subscription){
        subscription=await registration.pushManager.subscribe({
          userVisibleOnly:true,
          applicationServerKey:base64ToBytes(config.publicKey)
        });
      }
      await api('/push/subscribe',{method:'POST',body:subscription.toJSON()});
      setStatus({...config,subscribed:true,loading:false});
      return true;
    }catch(e){setError(e.code||'PUSH_ERROR');return false;}
    finally{setBusy(false);}
  },[supported]);

  const disable=useCallback(async()=>{
    if(!supported)return false;
    setBusy(true);setError('');
    try{
      const registration=await navigator.serviceWorker.getRegistration('./');
      const subscription=await registration?.pushManager.getSubscription();
      if(subscription){
        await api('/push/unsubscribe',{method:'POST',body:{endpoint:subscription.endpoint}});
        await subscription.unsubscribe();
      }
      setStatus(s=>({...s,subscribed:false}));
      return true;
    }catch(e){setError(e.code||'PUSH_ERROR');return false;}
    finally{setBusy(false);}
  },[supported]);

  return {supported,...status,busy,error,enable,disable,refresh};
}
