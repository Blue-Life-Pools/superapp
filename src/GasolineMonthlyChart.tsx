import { useMemo, useState } from 'react';
import { summarizeFuel, type FuelPurchase } from './gasolineData';

const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const fullMonthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const gallons = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function MonthlyBars({ year, series, values }: { year: string; series: 'gallons' | 'spending'; values: (number | null)[] }) {
  const maximum = Math.max(0, ...values.map(value => value ?? 0));
  const minimum = Math.min(0, ...values.map(value => value ?? 0));
  const range = maximum - minimum || 1;
  const baseline = minimum === 0 ? 100 : maximum / range * 100;
  const format = series === 'spending' ? dollars : gallons;
  const title = series === 'spending' ? 'Fuel spending (USD)' : 'Gallons purchased';

  return <div className={`gasoline-chart-series gasoline-chart-series-${series}`}>
    <h3>{title}</h3>
    <ul className="gasoline-chart" role="list" aria-label={title}>
      {values.map((value, index) => {
        const month = new Date(Date.UTC(Number(year), index, 1));
        const amount = value === null ? '—' : format.format(value);
        const barSize = Math.abs(value ?? 0) / range * 100;
        return <li key={index} aria-label={fullMonthLabel.format(month) + ' ' + (value === null ? 'no transactions' : amount + (series === 'gallons' ? ' gallons' : ''))}>
          <strong className="gasoline-chart-value">{amount}</strong>
          <div className="gasoline-chart-plot" aria-hidden="true">
            <span className="gasoline-chart-zero" style={{ top: `${baseline}%` }} />
            {value !== null && value !== 0 && <span className={value < 0 ? 'gasoline-chart-bar is-credit' : 'gasoline-chart-bar'}
              style={{ top: `${value < 0 ? baseline : baseline - barSize}%`, height: `${barSize}%` }} />}
          </div>
          <span>{monthLabel.format(month)}</span>
        </li>;
      })}
    </ul>
  </div>;
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
    <div className="gasoline-chart-scroll" role="region" aria-label="Monthly fuel charts" tabIndex={0}>
      <MonthlyBars year={year} series="gallons" values={values.map(value => value?.gallons ?? null)} />
      <MonthlyBars year={year} series="spending" values={values.map(value => value?.dollars ?? null)} />
    </div>
    <p>— No transactions for the selected technician or team.</p>
  </section>;
}
