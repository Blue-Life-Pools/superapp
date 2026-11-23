import { useMemo, useState } from 'react';
import { summarizeFuel, type FuelPurchase } from './gasolineData';

const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const fullMonthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const gallons = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

const series = [
  { key: 'gallons', label: 'Gallons purchased', format: gallons },
  { key: 'dollars', label: 'Fuel spending (USD)', format: dollars },
] as const;

function MonthlyBars({ year, values }: { year: string; values: ({ gallons: number; dollars: number } | null)[] }) {
  const scales = series.map(({ key }) => Math.max(...values.map(value => Math.abs(value?.[key] ?? 0))) || 1);
  const heights = values.map(value => series.map(({ key }, index) => (value?.[key] ?? 0) / scales[index]));
  const maximum = Math.max(0, ...heights.flat());
  const minimum = Math.min(0, ...heights.flat());
  const range = maximum - minimum || 1;
  const baseline = minimum === 0 ? 100 : maximum / range * 100;

  return <>
    <div className="gasoline-chart-legend">
      {series.map(({ key, label }) => <span key={key}><i className={`gasoline-chart-swatch is-${key}`} aria-hidden="true" />{label}</span>)}
      <small>Separate scales</small>
    </div>
    <div className="gasoline-chart-scroll" role="region" aria-label="Monthly fuel chart" tabIndex={0}>
      <ul className="gasoline-chart" role="list">
        {values.map((value, index) => {
          const month = new Date(Date.UTC(Number(year), index, 1));
          const label = value ? `${gallons.format(value.gallons)} gallons, ${dollars.format(value.dollars)}` : 'no transactions';
          return <li key={index} aria-label={`${fullMonthLabel.format(month)} ${label}`}>
            <div className="gasoline-chart-values">
              {value ? series.map(({ key, format }) => <strong className={`is-${key}`} key={key}>{format.format(value[key])}</strong>) : <span>—</span>}
            </div>
            <div className="gasoline-chart-plot" aria-hidden="true">
              <span className="gasoline-chart-zero" style={{ top: `${baseline}%` }} />
              {series.map(({ key }, seriesIndex) => {
                const height = heights[index][seriesIndex] / range * 100;
                if (!height) return null;
                return <span key={key} className={`gasoline-chart-bar is-${key}${height < 0 ? ' is-credit' : ''}`}
                  style={{ top: `${baseline - Math.max(0, height)}%`, height: `${Math.abs(height)}%` }} />;
              })}
            </div>
            <span>{monthLabel.format(month)}</span>
          </li>;
        })}
      </ul>
    </div>
  </>;
}

export function GasolineMonthlyChart({ purchases, months }: { purchases: FuelPurchase[]; months: string[] }) {
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const years = [...new Set(months.map(month => month.slice(0, 4)))];
  const year = years.includes(selectedYear) ? selectedYear : years[0];
  const summaries = useMemo(() => Array.from({ length: 12 }, (_, index) =>
    summarizeFuel(purchases, year + '-' + String(index + 1).padStart(2, '0')),
  ), [purchases, year]);
  const drivers = [...new Map(summaries.flatMap(summary => summary.drivers.map(driver => [driver.key, driver.name] as const)))]
    .sort((first, second) => first[1].localeCompare(second[1], 'en'));
  const driverIndex = drivers.findIndex(([key]) => key === selectedDriver);
  const driverKey = drivers[driverIndex]?.[0];
  const values = summaries.map(summary => {
    if (driverKey === undefined) {
      return summary.first ? { dollars: summary.spent / 100, gallons: summary.gallons } : null;
    }
    const driver = summary.drivers.find(item => item.key === driverKey);
    return driver ? { dollars: driver.cents / 100, gallons: driver.gallons } : null;
  });

  return <section className="gasoline-panel" aria-labelledby="gasoline-monthly-title">
    <div className="gasoline-section-header">
      <h2 id="gasoline-monthly-title">Monthly fuel by technician</h2>
      <div className="gasoline-chart-filters">
        <label>Year<select value={year} onChange={event => setSelectedYear(event.currentTarget.value)}>
          {years.map(item => <option key={item}>{item}</option>)}
        </select></label>
        <label>Technician<select value={driverIndex} onChange={event => setSelectedDriver(drivers[Number(event.currentTarget.value)]?.[0] ?? null)}>
          <option value={-1}>All technicians</option>
          {drivers.map(([key, name], index) => <option value={index} key={key}>{name}</option>)}
        </select></label>
      </div>
    </div>
    <MonthlyBars year={year} values={values} />
    <p>— No transactions for the selected technician or team.</p>
  </section>;
}
