import { useMemo, useState } from 'react';
import { CATEGORIES, totals } from '../lib/finance';
import { categoryName, useI18n } from '../lib/i18n';
import { Icon } from './Icon';

function monthKey(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; }
function options(locale, count=12) {
  const now = new Date();
  return Array.from({length:count},(_,i)=>{const d=new Date(now.getFullYear(),now.getMonth()-i,1);return {value:monthKey(d),label:d.toLocaleDateString(locale,{month:'long',year:'numeric'})};});
}

export function InsightsView({ movements, currency, hidden }) {
  const { t, money, locale } = useI18n();
  const months = useMemo(()=>options(locale),[locale]);
  const [month,setMonth] = useState(months[0].value);
  const selected = useMemo(()=>movements.filter(m=>m.date.startsWith(month)),[movements,month]);
  const sum = totals(selected);
  const expenses = selected.filter(m=>m.type==='expense');
  const incomes = selected.filter(m=>m.type==='income');
  const categories = useMemo(()=>Object.entries(expenses.reduce((acc,m)=>{acc[m.category]=(acc[m.category]||0)+m.amountCents;return acc;},{})).sort((a,b)=>b[1]-a[1]),[expenses]);
  const maxCategory = Math.max(1,...categories.map(([,value])=>value));
  const savingsRate = sum.income ? Math.round(((sum.income-sum.expense)/sum.income)*100) : 0;
  const [year,monthNumber]=month.split('-').map(Number);
  const days=new Date(year,monthNumber,0).getDate();
  const activeDays = new Set(selected.map(m=>m.date)).size || 1;
  const avgExpense = sum.expense / activeDays;
  const fmt=value=>hidden?'••••••':money(value,currency);
  const insight = !selected.length
    ? t('Agrega movimientos para empezar a detectar patrones.','Add movements to start detecting patterns.')
    : savingsRate >= 30
      ? t('Este mes estás conservando una parte sólida de tus ingresos. Mantén el ritmo y revisa si puedes dirigir una fracción extra a tu meta.','You are keeping a solid share of your income this month. Keep the pace and consider directing a little more to your goal.')
      : savingsRate >= 10
        ? t('Tu balance del mes es positivo, pero los gastos principales todavía tienen margen de optimización.','Your monthly balance is positive, but your main expenses still have room for optimization.')
        : t('Tus gastos están consumiendo casi todos tus ingresos del mes. Revisa primero la categoría con mayor peso.','Your expenses are consuming most of this month’s income. Start by reviewing the largest category.');
  return <div className="v2-insights-view">
    <section className="panel v2-insights-hero"><div><span className="v2-heading-icon"><Icon name="sparkles"/></span><p className="eyebrow">{t('ANÁLISIS INTELIGENTE','SMART ANALYSIS')}</p><h2>{t('Entiende tu dinero de un vistazo.', 'Understand your money at a glance.')}</h2><p>{t('Todo se calcula con tus movimientos existentes; no necesitas registrar datos adicionales.','Everything is calculated from your existing movements; no extra data entry required.')}</p></div><label>{t('Periodo','Period')}<select value={month} onChange={e=>setMonth(e.target.value)}>{months.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label></section>
    <section className="v2-insight-kpis">
      <article><span><Icon name="up"/></span><div><small>{t('Ingresos','Income')}</small><strong>{fmt(sum.income)}</strong><em>{currency}</em></div></article>
      <article><span><Icon name="down"/></span><div><small>{t('Gastos','Expenses')}</small><strong>{fmt(sum.expense)}</strong><em>{currency}</em></div></article>
      <article><span><Icon name="target"/></span><div><small>{t('Tasa de ahorro','Savings rate')}</small><strong>{savingsRate}%</strong><em>{t('del ingreso','of income')}</em></div></article>
      <article><span><Icon name="calendar"/></span><div><small>{t('Gasto / día activo','Spend / active day')}</small><strong>{fmt(Math.round(avgExpense))}</strong><em>{`${activeDays}/${days} ${t('días','days')}`}</em></div></article>
    </section>
    <div className="v2-insights-grid">
      <section className="panel v2-category-panel"><div className="v2-panel-heading"><div><h2>{t('Dónde se va tu dinero','Where your money goes')}</h2><p>{t('Distribución de gastos por categoría','Expense distribution by category')}</p></div></div><div className="v2-category-list">{categories.length?categories.map(([category,value])=><div className="v2-category-row" key={category}><span className={`v2-movement-icon ${CATEGORIES[category]?.tone||'gray'}`}><Icon name={CATEGORIES[category]?.icon||'layers'} size={17}/></span><div><div><strong>{categoryName(category,t)}</strong><span>{fmt(value)}</span></div><div className="v2-category-track"><span style={{width:`${Math.max(4,(value/maxCategory)*100)}%`}}/></div></div></div>):<div className="v2-empty-list"><Icon name="layers"/><p>{t('No hay gastos en este periodo.','No expenses in this period.')}</p></div>}</div></section>
      <section className="panel v2-smart-note"><span className="v2-smart-note-icon"><Icon name="sparkles" size={22}/></span><p className="eyebrow">{t('LECTURA DEL MES','MONTHLY READ')}</p><h2>{t('Una recomendación basada en tus datos','A recommendation based on your data')}</h2><p>{insight}</p><div className="v2-note-facts"><span><Icon name="arrows" size={15}/><b>{selected.length}</b> {t('movimientos','movements')}</span><span><Icon name="calendar" size={15}/><b>{activeDays}</b> {t('días con actividad','active days')}</span><span><Icon name="wallet" size={15}/><b>{fmt(sum.balance)}</b> {t('balance del mes','monthly balance')}</span></div></section>
    </div>
    <section className="panel v2-monthly-flow"><div className="v2-panel-heading"><div><h2>{t('Ritmo del mes','Monthly pace')}</h2><p>{t('Compara lo que entra y lo que sale sin perderte en detalles.','Compare money in and money out without getting lost in details.')}</p></div></div><div className="v2-flow-comparison"><div><span>{t('Ingresos','Income')}</span><div className="v2-flow-track"><span style={{width:`${sum.income?100:0}%`}}/></div><strong>{fmt(sum.income)}</strong></div><div className="expense"><span>{t('Gastos','Expenses')}</span><div className="v2-flow-track"><span style={{width:`${sum.income?Math.min(100,(sum.expense/sum.income)*100):(sum.expense?100:0)}%`}}/></div><strong>{fmt(sum.expense)}</strong></div></div></section>
  </div>;
}
