import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
export function ProfileForm({ user, onSaved, onSessionExpired, onBusy }) {
  const { t, error } = useI18n();
  const [avatar, setAvatar] = useState(user.avatar);
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState(false);
  const picker = useRef(null);
  useEffect(()=>{onBusy?.(busy);},[busy,onBusy]);
  async function choose(e) {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    setBusy(true); setMessage('');
    let bitmap;
    try {
      if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('INVALID_AVATAR');
      bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
      const ctx = canvas.getContext('2d'); const size = Math.min(bitmap.width, bitmap.height);
      ctx.fillStyle = '#f5f7ee'; ctx.fillRect(0,0,256,256);
      ctx.drawImage(bitmap, (bitmap.width-size)/2, (bitmap.height-size)/2, size, size, 0,0,256,256);
      setAvatar(canvas.toDataURL('image/jpeg',0.86));
    } catch { setFailure(true); setMessage(error('INVALID_AVATAR')); }
    finally { bitmap?.close(); setBusy(false); }
  }
  return <form className="form" onSubmit={async e => { e.preventDefault(); if(busy)return;setBusy(true);setMessage('');try { const result=await api('/profile',{method:'PATCH',body:{name,avatar}});onSaved(result.user);setFailure(false);setMessage(t('Perfil actualizado.','Profile updated.')); }catch(e){setFailure(true);setMessage(error(e));if(e.code==='UNAUTHORIZED')onSessionExpired();}finally{setBusy(false);} }}><div className="profile-editor"><div className="profile-photo">{avatar ? <img src={avatar} alt={t('Foto de perfil','Profile photo')} /> : <span>{name.slice(0,1).toUpperCase()}</span>}</div><div><button className="button secondary" type="button" disabled={busy} onClick={() => picker.current.click()}>{t('Cambiar foto','Change photo')}</button>{avatar && <button className="text-button" type="button" disabled={busy} onClick={() => setAvatar('')}>{t('Quitar foto','Remove photo')}</button>}<p className="hint">PNG, JPG, WebP · {t('Hasta 5 MB','Up to 5 MB')}</p></div></div><input ref={picker} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={choose} aria-label={t('Seleccionar foto','Select photo')} /><label>{t('Nombre','Name')}<input name="profileName" required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label><label>{t('Correo electrónico','Email address')}<input value={user.email} readOnly /></label>{message && <p role={failure?'alert':'status'} className={failure?'form-error':'hint'}>{message}</p>}<button className="button primary" disabled={busy}>{busy?t('Guardando…','Saving…'):t('Guardar perfil','Save profile')}</button></form>;
}
