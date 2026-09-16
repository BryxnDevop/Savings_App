import { useState } from 'react';
import { useI18n } from '../lib/i18n';
import { totals, today } from '../lib/finance';
import { fortnightGroups } from '../lib/ledger';
import { LedgerTable } from './LedgerTable';
import { Icon } from './Icon';
export function MonthlyRegister({ movements, currency, hidden }) {
  const { t, locale, money } = useI18n();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth()+1);
  const period = `${year}-${String(month).padStart(2,'0')}`;
  const groups = fortnightGroups(movements,period);
  const monthName = new Date(year,month-1,1).toLocaleDateString(locale,{month:'long',year:'numeric'});
  const years = [...new Set([new Date().getFullYear(),year,...movements.map(m=>Number(m.date.slice(0,4)))])].sort((a,b)=>b-a);
  const fmt = n => hidden ? '••••' : money(n,currency);
  return <div className="monthly-register"><section className="panel month-selector"><div className="panel-heading"><div><h2>{t('Un año de pequeños pasos','A year of small steps')}</h2><p>{t('Elige un mes para consultar sus dos quincenas.','Choose a month to view both halves.')}</p></div><select aria-label={t('Año del registro','Register year')} value={year} onChange={e=>setYear(Number(e.target.value))}>{years.map(y=><option key={y}>{y}</option>)}</select></div><div className="month-grid">{Array.from({length:12},(_,i)=>{
    const key=`${year}-${String(i+1).padStart(2,'0')}`; const list=movements.filter(m=>m.date.startsWith(key));const total=totals(list);
    return <button key={key} className={month===i+1?'selected':''} onClick={()=>setMonth(i+1)} aria-pressed={month===i+1}><strong>{new Date(year,i,1).toLocaleDateString(locale,{month:'long'})}</strong><span>{list.length} {t('registros','records')}</span>{list.length>0&&<small className={total.balance>=0?'positive':'negative'}>{fmt(total.balance)}</small>}</button>;
  })}</div></section><div className="register-heading"><h2>{monthName}</h2><span>{currency} · {t('Importes convertidos con tus tasas','Amounts converted using your rates')}</span></div><div className="fortnight-grid">{groups.map((group,i)=><section key={group.from} className="panel fortnight-panel"><div className="panel-heading"><div><p className="eyebrow">{i===0?t('PRIMERA QUINCENA','FIRST HALF'):t('SEGUNDA QUINCENA','SECOND HALF')}</p><h2>{t('Del','Days')} {group.from} {t('al','to')} {group.to}</h2></div><span className="icon-tile pale"><Icon name="calendar" /></span></div><div className="fortnight-totals"><div><span>{t('Entradas','Income')}</span><strong className="positive">{fmt(group.income)}</strong></div><div><span>{t('Gastos','Expenses')}</span><strong>{fmt(group.expense)}</strong></div><div><span>{t('Balance de la quincena','Half-month net')}</span><strong>{fmt(group.balance)}</strong></div></div><LedgerTable rows={group.items} currency={currency} hidden={hidden} /></section>)}</div></div>;
}
