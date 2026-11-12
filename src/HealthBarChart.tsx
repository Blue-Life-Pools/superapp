import './HealthBarChart.css';

type HealthBarChartProps = {
  items: Array<{ label: string; value: number }>;
  variant: 'reports' | 'estimates';
  label: string;
};

export function HealthBarChart({ items, variant, label }: HealthBarChartProps) {
  const maximum = Math.max(1, ...items.map((item) => item.value));

  return <div className={`health-summary-bars-scroll health-summary-bars-${variant}`} role="region" aria-label={label} tabIndex={0}>
    <div className="health-summary-bars" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }} role="list">
      {items.map((item) => <div className={`health-summary-bar-column${item.value === 0 ? ' is-zero' : ''}`} role="listitem" aria-label={`${item.label}: ${item.value}`} key={item.label}>
        <div className="health-summary-bar-plot">
          <strong className="health-summary-bar-value">{item.value.toLocaleString('en-US')}</strong>
          <span className="health-summary-bar-fill" style={{ height: `${item.value === 0 ? 2 : Math.max(4, item.value / maximum * 104)}px` }} aria-hidden="true" />
        </div>
        <span className="health-summary-bar-label">{item.label}</span>
      </div>)}
    </div>
  </div>;
}
