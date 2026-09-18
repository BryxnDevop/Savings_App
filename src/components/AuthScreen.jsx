import { useState, useRef } from 'react';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
import { Icon } from './Icon';

export function AuthScreen({ onLogin, initialError = '' }) {
  const { t, language, setLanguage, error } = useI18n();
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [created,setCreated]=useState(false);
  const [email,setEmail]=useState('');
  const passwordRef=useRef(null);
  async function submit(e) {
    e.preventDefault(); if (busy) return; setMessage('');
    const fields = Object.fromEntries(new FormData(e.target));
    if (register && fields.password !== fields.confirm) { setMessage(error('PASSWORD_MISMATCH')); return; }
    setBusy(true);
    try {
      const result = await api(register ? '/auth/register' : '/auth/login', { method: 'POST', body: { ...fields, language } });
      if(register){setEmail(fields.email);e.target.reset();setRegister(false);setCreated(true);requestAnimationFrame(()=>passwordRef.current?.focus());}
      else await onLogin(result.user);
    }
    catch (e) { setMessage(error(e)); }
    finally { setBusy(false); }
  }
  return <main className="auth-shell"><section className="auth-story"><a className="brand" href="#"><img src="./icons/logo.svg" width="45" height="45" alt="" /><strong>Ahorra+</strong></a><div><p className="eyebrow">{t('PEQUEÑOS PASOS. GRANDES METAS.', 'SMALL STEPS. BIG GOALS.')}</p><h1>{t('Tu tranquilidad empieza aquí.', 'Your peace of mind starts here.')}</h1><p>{t('Un espacio para entender tus movimientos, cuidar tus ahorros y construir lo que viene.', 'A space to understand your spending, grow your savings and build what comes next.')}</p><div className="auth-feature"><Icon name="shield" /><span>{t('Tus registros, vinculados a tu cuenta.', 'Your records, connected to your account.')}</span></div><div className="auth-feature"><Icon name="calendar" /><span>{t('Cada mes. Cada quincena. Todo claro.', 'Every month. Every half-month. All clear.')}</span></div></div><p className="auth-footnote">{t('Un poco hoy, más posibilidades mañana.', 'A little today, more possibilities tomorrow.')}</p></section><section className="auth-form-panel"><label className="auth-language"><span className="sr-only">{t('Idioma', 'Language')}</span><select value={language} onChange={e => setLanguage(e.target.value)}><option value="es">Español</option><option value="en">English</option></select></label><div className="auth-form-wrap"><span className="icon-tile green"><Icon name="leaf" size={26} /></span><h2>{register ? t('Tu próximo paso empieza hoy.', 'Your next step starts today.') : t('Qué bueno verte de nuevo.', 'Good to see you again.')}</h2><p className="muted">{register ? t('Crea tu cuenta y empieza a organizarte.', 'Create your account and get organized.') : t('Inicia sesión para acceder a tus ahorros.', 'Sign in to access your savings.')}</p>{created&&<p className="auth-success" role="status">{t('Cuenta creada correctamente. Inicia sesión con tu correo y contraseña.','Account created successfully. Sign in with your email and password.')}</p>}<form className="form" onSubmit={submit}>
      {register && <label>{t('Nombre', 'Name')}<input name="name" autoComplete="name" required maxLength={80} /></label>}
      <label>{t('Correo electrónico', 'Email address')}<input name="email" value={email} onChange={e=>setEmail(e.target.value)} type="email" autoComplete="email" required maxLength={254} /></label>
      <label>{t('Contraseña', 'Password')}<input ref={passwordRef} name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 10 : undefined} maxLength={128} /></label>
      {register && <><label>{t('Confirmar contraseña', 'Confirm password')}<input name="confirm" type="password" autoComplete="new-password" required minLength={10} maxLength={128} /></label><p className="hint">{t('Usa al menos 10 caracteres.', 'Use at least 10 characters.')}</p></>}
      {(message || (!created && initialError)) && <p role="alert" className="form-error">{message || initialError}</p>}
      <button className="button primary full-width" disabled={busy}>{busy ? t('Conectando…', 'Connecting…') : register ? t('Crear mi cuenta', 'Create my account') : t('Iniciar sesión', 'Sign in')}<Icon name="right" size={17} /></button>
    </form><p className="auth-switch">{register ? t('¿Ya tienes cuenta?', 'Already have an account?') : t('¿Es tu primera vez?', 'First time here?')} <button className="text-button" disabled={busy} onClick={() => { setRegister(!register); setMessage(''); setCreated(false); }}>{register ? t('Inicia sesión', 'Sign in instead') : t('Crear una cuenta', 'Create an account')}</button></p></div></section></main>;
}
