import { useMemo, useState } from 'react';
import { monthlySeries } from '../lib/finance';
import { useI18n } from '../lib/i18n';
import { Icon } from './Icon';

export function ActivityChart({ movements, currency, hidden, onAdd }) {
  const { t, locale, money } = useI18n();
  const [months, setMonths] = useState(6);
  const [selected, setSelected] = useState(null);
  const [showData, setShowData] = useState(false);
  const series = useMemo(() => monthlySeries(movements, months, new Date(), locale), [movements, months, locale]);
  const values = series.map(p => p.balance);
  const min = Math.min(0, ...values), max = Math.max(10000, ...values);
  const range = Math.max(max - min, 1);
  const left = 62, right = 665, top = 25, bottom = 193;
  const px = i => left + i * (right - left) / (series.length - 1);
  const py = v => bottom - (v - min) / range * (bottom - top);
  const line = series.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(i)},${py(p.balance)}`).join(' ');
  const area = `${line} L${right},${py(0)} L${left},${py(0)} Z`;
  const label = n => hidden ? '•••' : new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n / 100);
  const point = selected === null ? null : series[selected];
  return <section className="panel activity-panel">
    <div className="panel-heading"><div><h2>{t('Así crecen tus ahorros','Watch your savings grow')}</h2><p>{t('Tu saldo acumulado al cierre de cada mes','Your cumulative balance at each month end')}</p></div><select aria-label={t('Periodo del gráfico','Chart period')} value={months} onChange={e => { setMonths(Number(e.target.value)); setSelected(null); }} className="small-select"><option value="6">{t('6 meses','6 months')}</option><option value="12">{t('12 meses','12 months')}</option></select></div>
    <div className="chart-legend"><span className="legend-dot" /> {t('Saldo acumulado','Cumulative balance')} <span className="chart-currency">{currency}</span>{point && <span className="chart-point-label" role="status">{point.fullLabel}: {hidden ? '••••' : money(point.balance, currency)}</span>}</div>
    <div className={`chart ${!movements.length ? 'chart-empty' : ''}`}>
      <svg viewBox="0 0 700 230" role="img" aria-label={hidden ? t('Importes ocultos','Amounts hidden') : t('Evolución del saldo. Consulta la tabla de datos debajo del gráfico.','Balance trend. See the data table below the chart.')}>
        <defs><linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a7cc87" stopOpacity=".38" /><stop offset="100%" stopColor="#a7cc87" stopOpacity=".015" /></linearGradient></defs>
        {[0, 1, 2, 3, 4].map(i => { const v = min + range * i / 4; return <g key={i}><line x1={left} x2={right} y1={py(v)} y2={py(v)} stroke="#e8ece6" strokeDasharray="3 5" /><text x={left - 14} y={py(v) + 4} textAnchor="end" className="axis-label">{label(v)}</text></g>; })}
        {!hidden && <><path d={area} fill="url(#area-fill)" /><path d={line} fill="none" stroke="#39724b" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />{series.map((p, i) => <g key={p.key}><circle cx={px(i)} cy={py(p.balance)} r={selected === i ? 6 : 3.5} fill="#39724b" stroke="white" strokeWidth="2" /><circle className="chart-hit" cx={px(i)} cy={py(p.balance)} r="13" fill="transparent" tabIndex={0} role="button" aria-label={`${p.fullLabel}: ${money(p.balance, currency)}`} onMouseEnter={() => setSelected(i)} onMouseLeave={() => setSelected(null)} onFocus={() => setSelected(i)} onBlur={() => setSelected(null)} onClick={() => setSelected(i)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(i); } }} /></g>)}</>}
        {series.map((p, i) => <text key={p.key} x={px(i)} y="223" textAnchor="middle" className="axis-label month-label">{p.label}</text>)}
      </svg>
      {!movements.length && <div className="chart-empty-message"><span className="icon-tile green"><Icon name="leaf" /></span><strong>{t('Todo empieza con un pequeño ahorro','It starts with a small saving')}</strong><p>{t('Registra tu primer movimiento para ver tu progreso.','Record your first movement to see your progress.')}</p><button className="text-button" onClick={onAdd}>{t('Empezar a ahorrar','Start saving')} <Icon name="right" size={16} /></button></div>}
      {hidden && movements.length > 0 && <div className="hidden-chart">{t('Importes ocultos','Amounts hidden')}</div>}
    </div>
    <div className="chart-footer"><span><Icon name="info" size={14} /> {t('Incluye el saldo de meses anteriores','Includes the balance from earlier months')}</span><button className="text-button" onClick={() => setShowData(!showData)} aria-expanded={showData}>{showData ? t('Ocultar datos','Hide data') : t('Ver datos','View data')}</button></div>
    {showData && <div className="table-scroll"><table className="chart-table"><caption className="sr-only">{t('Datos mensuales del gráfico','Monthly chart data')}</caption><thead><tr><th>{t('Mes','Month')}</th><th>{t('Entradas','Income')}</th><th>{t('Salidas','Expenses')}</th><th>{t('Saldo','Balance')}</th></tr></thead><tbody>{series.map(p => <tr key={p.key}><td>{p.fullLabel}</td>{['income', 'expense', 'balance'].map(key => <td key={key}>{hidden ? '••••' : money(p[key], currency)}</td>)}</tr>)}</tbody></table></div>}
  </section>;
}
