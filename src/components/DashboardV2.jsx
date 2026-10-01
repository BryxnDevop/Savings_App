import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { GoalCard } from './GoalCard';
import { UpcomingPayments } from './UpcomingPayments';
import { CATEGORIES, sortMovements, totals } from '../lib/finance';
import { categoryName, useI18n } from '../lib/i18n';

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthOptions(locale, count = 6) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    return {
      value: monthKey(date),
      label: date.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
      shortLabel: date.toLocaleDateString(locale, { month: 'short' }),
    };
  });
}

function previousMonth(key) {
  const [year, month] = key.split('-').map(Number);
  return monthKey(new Date(year, month - 2, 1));
}

function percentageDelta(current, previous) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function formatDelta(value) {
  if (!Number.isFinite(value)) return '0%';
  const rounded = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${value >= 0 ? '+' : '−'}${Math.abs(rounded)}%`;
}

function monthTotals(movements, key) {
  return totals(movements.filter(movement => movement.date.startsWith(key)));
}

function Sparkline({ values, tone = 'income' }) {
  const safeValues = values.length ? values : [0, 0];
  const max = Math.max(...safeValues, 1);
  const min = Math.min(...safeValues, 0);
  const range = Math.max(max - min, 1);
  const points = safeValues.map((value, index) => {
    const x = safeValues.length === 1 ? 50 : (index / (safeValues.length - 1)) * 100;
    const y = 34 - ((value - min) / range) * 28;
    return `${x},${y}`;
  }).join(' ');
  return <svg className={`v2-sparkline ${tone}`} viewBox="0 0 100 38" aria-hidden="true"><polyline points={points} fill="none" vectorEffect="non-scaling-stroke" /></svg>;
}

function SummaryCards({ movements, currency, hidden, selectedMonth }) {
  const { t, money } = useI18n();
  const all = totals(movements);
  const current = monthTotals(movements, selectedMonth);
  const previous = monthTotals(movements, previousMonth(selectedMonth));
  const monthlyBuckets = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    return Array.from({ length: 6 }, (_, reverseIndex) => {
      const date = new Date(year, month - 6 + reverseIndex, 1);
      const key = monthKey(date);
      return monthTotals(movements, key);
    });
  }, [movements, selectedMonth]);
  const fmt = value => hidden ? '••••••' : money(value, currency);
  const balanceDelta = percentageDelta(current.balance, previous.balance);
  const incomeDelta = percentageDelta(current.income, previous.income);
  const expenseDelta = percentageDelta(current.expense, previous.expense);
  const metrics = [
    { key: 'income', label: t('Total guardado', 'Total saved'), total: all.income, delta: incomeDelta, trend: monthlyBuckets.map(item => item.income), icon: 'up' },
    { key: 'expense', label: t('Total retirado', 'Total withdrawn'), total: all.expense, delta: expenseDelta, trend: monthlyBuckets.map(item => item.expense), icon: 'down' },
  ];
  return <section className="v2-stats-grid" aria-label={t('Resumen financiero', 'Financial overview')}>
    <article className="v2-balance-card">
      <div className="v2-balance-orbits" aria-hidden="true"><span/><span/><span/></div>
      <div className="v2-card-label"><span>{t('Saldo disponible', 'Available balance')}</span><Icon name="eye" size={17}/></div>
      <strong className="v2-balance-amount">{fmt(all.balance)} <small>{currency}</small></strong>
      <div className="v2-balance-meta"><span className={`v2-trend-pill ${balanceDelta < 0 ? 'negative' : 'positive'}`}><Icon name={balanceDelta < 0 ? 'down' : 'up'} size={13}/>{formatDelta(balanceDelta)}</span><span>{t('vs. mes pasado', 'vs. last month')}</span></div>
      <div className="v2-balance-footer"><span><Icon name="wallet" size={15}/>{t('Tu ahorro, hoy.', 'Your savings, today.')}</span><span><strong>{movements.length}</strong> {t('movimientos', 'movements')}</span></div>
    </article>
    {metrics.map(metric => <article className="v2-stat-card" key={metric.key}>
      <div className="v2-card-label"><span>{metric.label}</span><span className={`v2-stat-icon ${metric.key}`}><Icon name={metric.icon} size={18}/></span></div>
      <strong className="v2-stat-amount">{fmt(metric.total)} <small>{currency}</small></strong>
      <div className="v2-stat-footer"><span className={`v2-trend-pill ${metric.delta < 0 ? 'negative' : 'positive'}`}><Icon name={metric.delta < 0 ? 'down' : 'up'} size={12}/>{formatDelta(metric.delta)}</span><span>{t('este mes', 'this month')}</span><Sparkline values={metric.trend} tone={metric.key}/></div>
    </article>)}
  </section>;
}

function DailyCashflowChart({ movements, currency, hidden, month, onMonthChange, months }) {
  const { t, money, locale } = useI18n();
  const [year, monthNumber] = month.split('-').map(Number);
  const days = new Date(year, monthNumber, 0).getDate();
  const rows = Array.from({ length: days }, (_, index) => ({ day: index + 1, income: 0, expense: 0 }));
  for (const movement of movements) {
    if (!movement.date.startsWith(month)) continue;
    const day = Number(movement.date.slice(-2));
    const row = rows[day - 1];
    if (row) row[movement.type] += movement.amountCents;
  }
  const max = Math.max(1, ...rows.flatMap(row => [row.income, row.expense]));
  const chartHeight = 150;
  const chartWidth = 760;
  const left = 34;
  const right = 748;
  const baseline = 164;
  const usableWidth = right - left;
  const step = usableWidth / rows.length;
  const barWidth = Math.max(3, Math.min(8, step * .31));
  const y = value => Math.max(2, (value / max) * chartHeight);
  const total = monthTotals(movements, month);
  return <section className="panel v2-cashflow-panel">
    <div className="v2-panel-heading">
      <div className="v2-panel-title"><span className="v2-heading-icon"><Icon name="calendar" size={18}/></span><div><h2>{t('Resumen de tus movimientos', 'Movement overview')}</h2><p>{t('Ingresos y gastos del mes, día por día.', 'Income and expenses for the month, day by day.')}</p></div></div>
      <select value={month} onChange={event => onMonthChange(event.target.value)} aria-label={t('Mes del resumen', 'Overview month')}>{months.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select>
    </div>
    <div className="v2-chart-meta"><div><span className="v2-legend income"/>{t('Ingresos', 'Income')}<strong>{hidden ? '••••' : money(total.income, currency)}</strong></div><div><span className="v2-legend expense"/>{t('Gastos', 'Expenses')}<strong>{hidden ? '••••' : money(total.expense, currency)}</strong></div></div>
    <div className="v2-bar-chart" role="img" aria-label={t('Gráfico diario de ingresos y gastos', 'Daily income and expense chart')}>
      <svg viewBox="0 0 780 190" preserveAspectRatio="none" aria-hidden="true">
        {[0, .25, .5, .75, 1].map(level => <line key={level} x1="28" x2="758" y1={baseline - chartHeight * level} y2={baseline - chartHeight * level} className="v2-grid-line"/>)}
        {rows.map((row, index) => {
          const x = left + index * step + step / 2;
          return <g key={row.day}>
            <rect x={x - barWidth - 1} y={baseline - y(row.income)} width={barWidth} height={y(row.income)} rx="3" className="v2-bar income"><title>{`${row.day}: ${hidden ? '••••' : money(row.income, currency)} ${t('ingresos','income')}`}</title></rect>
            <rect x={x + 1} y={baseline - y(row.expense)} width={barWidth} height={y(row.expense)} rx="3" className="v2-bar expense"><title>{`${row.day}: ${hidden ? '••••' : money(row.expense, currency)} ${t('gastos','expenses')}`}</title></rect>
            {[1, 5, 10, 15, 20, 25, days].includes(row.day) && <text x={x} y="184" textAnchor="middle" className="v2-day-label">{row.day} {new Date(year, monthNumber - 1, row.day).toLocaleDateString(locale,{month:'short'}).replace('.','')}</text>}
          </g>;
        })}
      </svg>
      {!rows.some(row => row.income || row.expense) && <div className="v2-chart-empty"><Icon name="sparkles" size={22}/><strong>{t('Este mes todavía está en blanco', 'This month is still empty')}</strong><span>{t('Tus movimientos aparecerán aquí automáticamente.', 'Your movements will appear here automatically.')}</span></div>}
    </div>
  </section>;
}

function RecentMovements({ movements, currency, hidden, onViewAll }) {
  const { t, money, date } = useI18n();
  const rows = sortMovements(movements).slice(0, 5);
  return <section className="panel v2-recent-panel">
    <div className="v2-panel-heading compact"><div><h2>{t('Últimos movimientos', 'Recent movements')}</h2><p>{t('Actividad más reciente', 'Latest activity')}</p></div><button className="text-button" onClick={onViewAll}>{t('Ver todos', 'View all')}<Icon name="right" size={15}/></button></div>
    <div className="v2-recent-list">{rows.length ? rows.map(movement => <article key={movement.id} className="v2-recent-row"><span className={`v2-movement-icon ${CATEGORIES[movement.category]?.tone || 'gray'}`}><Icon name={CATEGORIES[movement.category]?.icon || 'layers'} size={17}/></span><div><strong>{movement.reason}</strong><span>{date(movement.date)} · {categoryName(movement.category, t)}</span></div><b className={movement.type}>{hidden ? '••••' : `${movement.type === 'income' ? '+' : '−'}${money(movement.amountCents, currency)}`}</b></article>) : <div className="v2-empty-list"><Icon name="arrows"/><p>{t('Aún no hay movimientos.', 'No movements yet.')}</p></div>}</div>
  </section>;
}

function FinancialPulse({ movements, currency, hidden, selectedMonth }) {
  const { t, money } = useI18n();
  const current = movements.filter(movement => movement.date.startsWith(selectedMonth));
  const month = totals(current);
  const savingsRate = month.income ? Math.round(((month.income - month.expense) / month.income) * 100) : 0;
  const expenses = current.filter(movement => movement.type === 'expense');
  const byCategory = expenses.reduce((acc, movement) => ({ ...acc, [movement.category]: (acc[movement.category] || 0) + movement.amountCents }), {});
  const topEntry = Object.entries(byCategory).sort((a,b) => b[1] - a[1])[0];
  const [year, monthNumber] = selectedMonth.split('-').map(Number);
  const elapsedDays = selectedMonth === monthKey(new Date()) ? Math.max(new Date().getDate(), 1) : new Date(year, monthNumber, 0).getDate();
  const avgDaily = month.expense / Math.max(elapsedDays, 1);
  const projectedExpense = avgDaily * new Date(year, monthNumber, 0).getDate();
  const remaining = month.income - projectedExpense;
  const cards = [
    { icon: 'target', label: t('Tasa de ahorro', 'Savings rate'), value: `${savingsRate}%`, sub: savingsRate >= 20 ? t('Buen margen este mes', 'Healthy margin this month') : t('Hay espacio para ajustar', 'There is room to adjust') },
    { icon: topEntry ? CATEGORIES[topEntry[0]]?.icon : 'layers', label: t('Mayor categoría de gasto', 'Top expense category'), value: topEntry ? categoryName(topEntry[0], t) : t('Sin gastos', 'No expenses'), sub: topEntry ? (hidden ? '••••' : money(topEntry[1], currency)) : t('Nada que mostrar', 'Nothing to show') },
    { icon: 'calendar', label: t('Gasto diario promedio', 'Average daily spend'), value: hidden ? '••••' : money(Math.round(avgDaily), currency), sub: t('Promedio del mes', 'Monthly average') },
    { icon: remaining >= 0 ? 'up' : 'down', label: t('Proyección de cierre', 'Month-end projection'), value: hidden ? '••••' : money(Math.round(remaining), currency), sub: remaining >= 0 ? t('Posible ahorro al cierre', 'Possible month-end savings') : t('Gasto proyectado sobre ingresos', 'Projected spending above income') },
  ];
  return <section className="v2-pulse-section"><div className="v2-section-header"><div><p className="eyebrow">{t('TU PULSO FINANCIERO','YOUR FINANCIAL PULSE')}</p><h2>{t('Lo importante, sin complicarlo.', 'What matters, without the noise.')}</h2></div></div><div className="v2-pulse-grid">{cards.map(card => <article className="v2-pulse-card" key={card.label}><span className="v2-pulse-icon"><Icon name={card.icon} size={18}/></span><div><span>{card.label}</span><strong>{card.value}</strong><small>{card.sub}</small></div></article>)}</div></section>;
}

export function DashboardV2({ movements, currency, hidden, goal, planning, onManagePayments, onEditGoal, onViewMovements, onAdd, demo }) {
  const { t, locale } = useI18n();
  const months = useMemo(() => monthOptions(locale, 8), [locale]);
  const [selectedMonth, setSelectedMonth] = useState(months[0]?.value || monthKey(new Date()));
  return <div className="v2-dashboard">
    <SummaryCards movements={movements} currency={currency} hidden={hidden} selectedMonth={selectedMonth}/>
    <div className="v2-main-grid"><DailyCashflowChart movements={movements} currency={currency} hidden={hidden} month={selectedMonth} onMonthChange={setSelectedMonth} months={months}/><RecentMovements movements={movements} currency={currency} hidden={hidden} onViewAll={onViewMovements}/></div>
    <div className="v2-secondary-grid"><UpcomingPayments data={planning?.schedules} onManage={onManagePayments} hidden={hidden}/><GoalCard goal={goal} balance={totals(movements).balance} currency={currency} hidden={hidden} demo={demo} onEdit={onEditGoal}/></div>
    <FinancialPulse movements={movements} currency={currency} hidden={hidden} selectedMonth={selectedMonth}/>
    {!movements.length && <button className="v2-empty-cta" onClick={onAdd}><Icon name="plus" size={18}/>{t('Registrar mi primer movimiento', 'Record my first movement')}</button>}
  </div>;
}
