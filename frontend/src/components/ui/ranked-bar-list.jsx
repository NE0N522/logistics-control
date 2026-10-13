import { formatMoney } from '../../lib/format.js';

export function RankedBarList({ items, nameKey = 'name', valueKey = 'revenue', subKey, emptyLabel }) {
  if (!items?.length) {
    return <p style={{ color: 'var(--ink-faint)', fontSize: 13 }}>{emptyLabel || 'Нет данных за выбранный период'}</p>;
  }
  const max = Math.max(...items.map((i) => i[valueKey]), 1);

  return (
    <div className="stack" style={{ gap: 14 }}>
      {items.map((item, index) => (
        <div key={item.id ?? item[nameKey]} className="stack" style={{ gap: 5 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              <span style={{ color: 'var(--ink-faint)', fontWeight: 500 }}>{index + 1}.</span> {item[nameKey]}
              {subKey && item[subKey] && (
                <span style={{ color: 'var(--ink-faint)', fontWeight: 500 }}> · {item[subKey]}</span>
              )}
            </span>
            <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 600 }}>
              {formatMoney(item[valueKey], { compact: true })}
            </span>
          </div>
          <div className="pill-progress">
            <div className="pill-progress__fill" style={{ width: `${Math.max(3, (item[valueKey] / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
