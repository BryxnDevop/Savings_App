import { useState } from 'react';
import { Modal } from './Modal';
import { ProfileForm } from './ProfileForm';
import { PasswordForm } from './AccountForms';
import { ThemePicker } from '../lib/theme';
import { useI18n } from '../lib/i18n';
import { Icon } from './Icon';
export function AccountDrawer({user,onSaved,expired,onClose,logout,busy,onLanguage,languageBusy,onMail,onCurrency,currency,currencyDisabled}){
  const {t,language}=useI18n();const [editing,setEditing]=useState(false);
  return <Modal className="account-drawer" title={t('Tu cuenta','Your account')} subtitle={t('Un espacio que se siente tuyo.','A space that feels like you.')} onClose={()=>{if(!editing)onClose();}}>
    <div className="drawer-profile-form"><ProfileForm user={user} onSaved={onSaved} onSessionExpired={expired} onBusy={setEditing}/></div>
    <div className="drawer-section"><ThemePicker/></div>
    <div className="drawer-section"><label className="setting-label">{t('Idioma','Language')}<select value={language} disabled={languageBusy} onChange={e=>onLanguage(e.target.value)}><option value="es">Español</option><option value="en">English</option></select></label></div>
    <button className="drawer-link" disabled={editing||currencyDisabled} onClick={onCurrency} aria-label={t('Cambiar moneda','Change currency')}><span className="icon-tile blue"><Icon name="arrows"/></span><span><strong>{t('Cambiar moneda','Change currency')}</strong><small>{currency} · {t('Convierte tu saldo, historial y meta','Convert your balance, history and goal')}</small></span><Icon name="chevron"/></button>
    <button className="drawer-link" disabled={editing} onClick={onMail}><span className="icon-tile green"><Icon name="mail"/></span><span><strong>{t('Correo bancario','Bank email')}</strong><small>{t('Conexión Gmail y movimientos automáticos','Gmail connection and automatic movements')}</small></span><Icon name="chevron"/></button>
    <details className="drawer-section"><summary>{t('Contraseña y seguridad','Password and security')}</summary><PasswordForm/></details>
    <button className="button secondary drawer-logout" disabled={busy||editing} onClick={logout}>{t('Cerrar sesión','Sign out')}</button>
  </Modal>;
}
