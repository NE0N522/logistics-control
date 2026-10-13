import { Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { formatPercent } from '../../lib/format.js';

export function KpiCard({ label, value, delta, hero = false, hint, icon: Icon = Activity }) {
  const showDelta = delta !== null && delta !== undefined && !Number.isNaN(delta);
  const isUp = showDelta && delta >= 0;

  return (
    <div className={`kpi-card${hero ? ' kpi-card--hero' : ''}`}>
      <div className="kpi-card__head"><span className="kpi-card__label">{label}</span><span className="kpi-card__icon"><Icon size={16} strokeWidth={1.8}/></span></div>
      <strong className="kpi-card__value">{value}</strong>
      {showDelta ? (
        <span className={`kpi-card__meta kpi-card__delta ${isUp ? 'kpi-card__delta--up' : 'kpi-card__delta--down'}`}>
          {isUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {formatPercent(delta, { withSign: true })} к прошлому периоду
        </span>
      ) : (
        hint && <span className="kpi-card__meta">{hint}</span>
      )}
    </div>
  );
}
