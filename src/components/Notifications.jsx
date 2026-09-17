import { useState } from 'react';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { paymentTiming } from './UpcomingPayments';
import { zonedToday } from '../lib/planning';
export function LowBalanceAlert({status,hidden=false}){
 const {t,money}=useI18n();if(!status.low)return null;
 return <section className="low-balance-alert" role="alert"><span className="low-balance-icon"><Icon name="bell" size={23}/></span><div><strong>{status.balance<=0?t('Tu presupuesto se agotó.','Your budget is exhausted.'):t('Tu presupuesto está por acabarse.','Your budget is running low.')}</strong><p>{t('Saldo disponible','Available balance')}: <b>{hidden?'••••••':money(status.balance,status.currency)} {status.currency}</b>. {t('Revisa tus próximos pagos antes de registrar más gastos.','Review upcoming bills before recording more expenses.')}</p><small>{t('Este aviso vuelve a aparecer al abrir la app mientras el saldo siga bajo.','This alert appears whenever you open the app while the balance stays low.')}</small></div></section>;
}
function describe(item,{t,money,locale},today){
 const p=item.payload;
 switch(item.kind){
  case 'budget80':return {icon:'wallet',tone:'soon',title:t(`Has gastado el ${p.percent}% de tu presupuesto.`,`You have spent ${p.percent}% of your budget.`),detail:t('Calculado sobre el total de entradas registradas.','Based on all recorded income.'),view:'movimientos'};
  case 'budget_low':return {icon:'bell',tone:'urgent',title:t('Tu presupuesto está por acabarse.','Your budget is running low.'),detail:`${t('Saldo','Balance')}: ${money(p.balance,p.currency)} ${p.currency}`,view:'movimientos'};
  case 'goal_near':return {icon:'target',tone:'later',title:t(`Tu meta «${p.name}» está a ${money(p.remaining,p.currency)} de completarse.`,`Your “${p.name}” goal is ${money(p.remaining,p.currency)} away.`),detail:p.currency,view:'meta'};
  case 'goal_reached':return {icon:'sparkles',tone:'later',title:t(`¡Completaste tu meta «${p.name}»!`,`You reached your “${p.name}” goal!`),detail:t('Tu constancia dio frutos.','Your consistency paid off.'),view:'meta'};
  case 'payment_due':return {icon:'calendar',tone:'soon',title:`${p.name} — ${paymentTiming(p.due,today,t,locale).label}`,detail:`${t('Pago recurrente','Recurring payment')}: ${money(p.amountCents,p.currency)} ${p.currency}`,view:'recurrentes'};
  case 'recurring_paid':return {icon:'repeat',tone:'later',title:t(`Se registró el pago de ${p.name}.`,`${p.name} payment was recorded.`),detail:`${money(p.amountCents,p.currency)} ${p.currency} · ${p.due}`,view:'movimientos'};
  case 'recurring_skipped':return {icon:'calendar',tone:'soon',title:t(`Se omitió el pago de ${p.name}.`,`${p.name} payment was skipped.`),detail:p.due,view:'recurrentes'};
  case 'recurring_review':return {icon:'info',tone:'urgent',title:t(`Revisa el pago de ${p.name}.`,`Review the ${p.name} payment.`),detail:p.issue==='POSSIBLE_DUPLICATE'?t('Puede estar ya registrado. No se volvió a descontar.','It may already be recorded. It was not deducted again.'):t('No se pudo registrar. Revisa el importe y las tasas.','Could not record it. Check the amount and rates.'),view:'recurrentes'};
  case 'bank_new':return {icon:'mail',tone:'later',title:t('Se detectó un aviso bancario nuevo.','A new bank alert was detected.'),detail:p.subject,view:'ajustes'};
  default:return {icon:'bell',tone:'later',title:t('Nuevo aviso','New notice'),detail:'',view:'resumen'};
 }
}
export function NotificationCenter({data,today=zonedToday(),failure,onRefresh,onClose,onNavigate,hidden=false}){
 const i18n=useI18n();const {t,error,locale}=i18n;const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function mark(body){setBusy(true);setMessage('');try{await api('/notifications/read',{method:'POST',body});await onRefresh();}catch(e){setMessage(error(e));}finally{setBusy(false);}}
 return <Modal className="account-drawer notification-drawer" title={t('Notificaciones','Notifications')} subtitle={t('Lo importante de tu dinero, a tiempo.','Your money’s important moments, on time.')} onClose={onClose}>
  <div className="notification-toolbar"><span>{data?.unread||0} {t('sin leer','unread')}</span><button className="text-button" disabled={busy||!data?.unread} onClick={()=>mark({all:true})}>{t('Marcar todas como leídas','Mark all as read')}</button></div>
  {(message||failure)&&<p className="form-error" role="alert">{message||error(failure)} <button className="text-button" onClick={onRefresh}>{t('Actualizar','Refresh')}</button></p>}
  {!data?<p className="muted">{t('Cargando avisos…','Loading notices…')}</p>:!data.items.length?<div className="notification-empty"><Icon name="bell" size={38}/><h3>{t('Todo al día.','All caught up.')}</h3><p>{t('Aquí verás tus pagos, alertas de saldo, avances de metas y nuevos avisos del banco.','See payments, balance alerts, goal progress and new bank alerts here.')}</p></div>:<div className="notification-list">{data.items.map(item=>{const content=describe(item,{...i18n,money:hidden?()=> '••••••':i18n.money},today);return <article key={item.id} className={`notification-item ${item.read_at?'':'unread'}`}><span className={`notification-icon ${content.tone}`}><Icon name={content.icon} size={20}/></span><div><h3>{content.title}</h3><p>{content.detail}</p><small>{new Date(item.created_at).toLocaleString(locale,{dateStyle:'short',timeStyle:'short'})}{!item.active&&` · ${t('Aviso anterior','Previous notice')}`}</small><div className="notification-actions"><button className="text-button" onClick={()=>{onClose();onNavigate(content.view);}}>{t('Ver detalle','View details')}</button>{!item.read_at&&<button className="text-button" disabled={busy} onClick={()=>mark({id:item.id})}>{t('Marcar leída','Mark read')}</button>}</div></div>{!item.read_at&&<span className="notification-dot" aria-label={t('Sin leer','Unread')}/>}</article>;})}</div>}
  <div className="alert-rules"><h3>{t('Cuándo te avisamos','When we notify you')}</h3><p>{t('Presupuesto: al gastar el 80% de tus entradas. Saldo bajo: al quedar el 10% o menos. Meta cercana: cuando falte el 20% o menos. Pagos: el día anterior. Banco: al detectar un aviso nuevo.','Budget: at 80% of recorded income spent. Low balance: 10% or less left. Near goal: 20% or less remaining. Payments: the day before. Bank: when a new alert is detected.')}</p></div>
  <p className="hint notification-help">{t('Los avisos se guardan en tu cuenta y se actualizan al abrir la app y cada minuto mientras está visible. Marcar una alerta como leída no oculta el aviso de saldo bajo al volver a entrar.','Notices are saved to your account and refreshed when you open the app and every minute while visible. Marking an alert as read does not hide the low-balance warning when you return.')}</p>
 </Modal>;
}
