import { useEffect, useId, useRef, useState } from 'react';
import './HealthLineChart.css';

type HealthLineChartProps = {
  values: number[];
  comparison?: number[];
  months: string[];
  outcome: string;
};

export function HealthLineChart({ values, comparison, months, outcome }: HealthLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  const gradientId = useId();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateWidth = () => setWidth(Math.round(container.getBoundingClientRect().width));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // The viewBox matches the rendered pixels, so text and circles never stretch.
  const height = 246;
  const margin = { top: 26, right: 26, bottom: 44, left: 48 };
  const baseline = height - margin.bottom;
  const plotHeight = baseline - margin.top;
  const maximum = Math.max(1, ...values, ...(comparison ?? []));
  const roughStep = maximum / 6;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = Math.max(1, [1, 2, 5, 10].find((factor) => factor * magnitude >= roughStep)! * magnitude);
  const axisMax = Math.ceil(maximum / step) * step;
  const x = (index: number) => margin.left + index * (width - margin.left - margin.right) / Math.max(1, months.length - 1);
  const y = (value: number) => baseline - value / axisMax * plotHeight;
  const points = (series: number[]) => series.map((value, index) => `${x(index)},${y(value)}`).join(' ');
  const labelY = (value: number, other: number | undefined, current: boolean) => {
    if (other !== undefined && Math.abs(y(value) - y(other)) < 30) {
      const above = value > other || (value === other && current);
      return y(value) + (above ? -13 : 17);
    }
    return y(value) - 13;
  };
  const series = [
    ...(comparison ? [{ year: 2025, data: comparison, current: false, color: '#174a7a' }] : []),
    { year: 2026, data: values, current: true, color: '#4b9dfc' },
  ];

  return <div className="health-outcome-plot-scroll" tabIndex={0} role="region" aria-label={`${outcome} monthly chart. Scroll horizontally on small screens.`}>
    <div ref={containerRef} className="health-outcome-plot-frame">
      <svg className="health-outcome-plot" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`${outcome}: monthly inspection counts for 2025 and 2026`}>
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#62a8f5" stopOpacity=".16" /><stop offset="100%" stopColor="#62a8f5" stopOpacity=".025" /></linearGradient></defs>
        {Array.from({ length: Math.round(axisMax / step) + 1 }, (_, index) => {
          const value = index * step;
          return <g key={value}>
            <line x1={margin.left} x2={width - margin.right} y1={y(value)} y2={y(value)} className={value === 0 ? 'health-outcome-baseline' : 'health-outcome-gridline'} />
            <text x={margin.left - 15} y={y(value)} className="health-outcome-axis-value" textAnchor="end" dominantBaseline="middle">{value}</text>
          </g>;
        })}
        <polygon points={`${points(values)} ${x(values.length - 1)},${baseline} ${x(0)},${baseline}`} fill={`url(#${gradientId})`} />
        {series.map(({ year, data, color }) => <polyline key={year} points={points(data)} className="health-outcome-series-line" stroke={color} />)}
        {series.map(({ year, data, current, color }) => <g key={year}>
          {data.map((value, index) => <g key={index}>
            <circle cx={x(index)} cy={y(value)} r="3.5" fill={color} className="health-outcome-marker"><title>{`${months[index]} ${year}: ${value}`}</title></circle>
            <text x={x(index)} y={labelY(value, current ? comparison?.[index] : values[index], current)} className={`health-outcome-point-value${current ? ' is-current' : ''}`} fill={current ? '#2878ca' : color} textAnchor="middle" dominantBaseline="middle">{value}</text>
          </g>)}
        </g>)}
        {months.map((month, index) => <text key={month} x={x(index)} y={height - 10} className="health-outcome-month" textAnchor="middle">{month}</text>)}
      </svg>
    </div>
  </div>;
}
