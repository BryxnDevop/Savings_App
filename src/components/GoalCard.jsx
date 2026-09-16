import { Icon } from './Icon';
import { useI18n } from '../lib/i18n';

export function GoalCard({ goal, balance, currency, onEdit, hidden = false, large = false, demo = false }) {
  const { t, money } = useI18n();
  const progress = goal ? (goal.progressPercent ?? (goal.targetCents > 0 ? Math.min(100, Math.max(0, balance / goal.targetCents * 100)) : 0)) : 0;
  const fmt = n => hidden ? '••••' : money(n, currency);
  return <section className={`panel goal-panel ${large ? 'goal-large' : ''}`}>
    <div className="panel-heading"><div><h2>{t('Un paso más cerca','One step closer')}</h2><p>{t('Tu próxima meta de ahorro','Your next savings goal')}</p></div><span className="icon-tile pale"><Icon name="target" /></span></div>
    <div className="goal-ring" aria-label={hidden ? t('Progreso oculto','Progress hidden') : `${Math.floor(progress)} % ${t('de la meta','of goal')}`}><svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="65" fill="none" stroke="#e9ede3" strokeWidth="11" /><circle cx="80" cy="80" r="65" fill="none" stroke="#75974d" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${hidden ? 0 : progress * 4.084} 408.4`} transform="rotate(-90 80 80)" /></svg><div>{goal ? <><strong>{hidden ? '••' : Math.floor(progress)}<small>%</small></strong><span>{t('de tu meta','of your goal')}</span></> : <Icon name="leaf" size={40} />}</div></div>
    <h3>{goal?.name || t('Dale un propósito a tu ahorro','Give your savings a purpose')}</h3>
    {goal ? <><p className="goal-amount"><strong>{fmt(Math.max(0, balance))}</strong> {t('de','of')} {fmt(goal.targetCents)}</p><p className="goal-message">{progress >= 100 ? t('¡Lo lograste! Tu constancia dio frutos.','You did it! Your consistency paid off.') : t('Cada pequeño paso te acerca.','Every small step brings you closer.')}</p></> : <p className="goal-message">{t('Un viaje, un proyecto o más tranquilidad. Tú decides qué viene después.','A trip, a project or more peace of mind. You decide what comes next.')}</p>}
    <button className="button secondary full-width" disabled={demo} onClick={onEdit}><Icon name={goal ? 'edit' : 'plus'} size={16} />{goal ? t('Editar mi meta','Edit my goal') : t('Crear mi primera meta','Create my first goal')}</button>
    {large && <p className="muted goal-explanation">{t('El progreso usa tu saldo total disponible. Los retiros reducen el progreso; crear una meta no mueve dinero.','Progress uses your available balance. Withdrawals reduce progress; creating a goal does not move money.')}</p>}
  </section>;
}
