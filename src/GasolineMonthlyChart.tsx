import { useId, useMemo, useRef, useState } from 'react';
import { summarizeFuel, type FuelPurchase } from './gasolineData';

const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const fullMonthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const compactDollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
const gallons = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

function FuelSpending({ month, amount, volume }: { month: string; amount: number; volume: number }) {
  const id = useId();
  const popover = useRef<HTMLDivElement>(null);
  const exact = dollars.format(amount);

  return <>
    <button type="button" className="gasoline-spending-button" popoverTarget={id}
      aria-label={`${month} fuel spending ${exact}. View fuel details`} onClick={event => {
        const anchor = event.currentTarget.getBoundingClientRect();
        const above = anchor.top >= 130;
        popover.current?.style.setProperty('--fuel-anchor-x', `${anchor.left + anchor.width / 2}px`);
        popover.current?.style.setProperty('--fuel-anchor-y', `${above ? anchor.top - 8 : anchor.bottom + 8}px`);
        popover.current?.style.setProperty('--fuel-anchor-offset', above ? '-100%' : '0%');
      }}>{Math.abs(amount) >= 1000 ? compactDollars.format(amount) : exact}</button>
    <div className="gasoline-spending-popover" id={id} ref={popover} popover="auto" role="region" aria-label={`${month} fuel details`}>
      <strong>{month}</strong>
      <dl>
        <dt>Fuel spending</dt><dd>{exact}</dd>
        <dt>Gallons purchased</dt><dd>{gallons.format(volume)}</dd>
      </dl>
    </div>
  </>;
}

function MonthlyBars({ year, values }: { year: string; values: ({ gallons: number; dollars: number } | null)[] }) {
  const volumes = values.map(value => value?.gallons ?? 0);
  const maximum = Math.max(0, ...volumes);
  const minimum = Math.min(0, ...volumes);
  const range = maximum - minimum || 1;
  const baseline = minimum === 0 ? 100 : maximum / range * 100;

  return <>
    <p className="gasoline-chart-legend"><span>Gallons purchased</span> Select a spending amount for details.</p>
    <div className="gasoline-chart-scroll" role="region" aria-label="Monthly fuel chart" tabIndex={0}
      onScroll={event => event.currentTarget.querySelector<HTMLElement>('.gasoline-spending-popover:popover-open')?.hidePopover()}>
      <ul className="gasoline-chart" role="list">
        {values.map((value, index) => {
          const month = new Date(Date.UTC(Number(year), index, 1));
          const name = fullMonthLabel.format(month);
          const label = value ? `${gallons.format(value.gallons)} gallons, ${dollars.format(value.dollars)}` : 'no transactions';
          const height = volumes[index] / range * 100;
          return <li key={index} aria-label={`${name} ${label}`}>
            <div className="gasoline-chart-plot" aria-hidden="true">
              <span className="gasoline-chart-zero" style={{ top: `${baseline}%` }} />
              {!!height && <span className={`gasoline-chart-bar${height < 0 ? ' is-credit' : ''}`}
                style={{ top: `${baseline - Math.max(0, height)}%`, height: `${Math.abs(height)}%` }} />}
              {value && <strong className="gasoline-chart-volume" style={{ top: `${baseline - Math.max(0, height)}%` }}>{gallons.format(value.gallons)}</strong>}
            </div>
            <span className="gasoline-chart-month">{monthLabel.format(month)}</span>
            <div className="gasoline-chart-spending">
              {value ? <FuelSpending month={name} amount={value.dollars} volume={value.gallons} /> : <span>—</span>}
            </div>
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
    <MonthlyBars key={JSON.stringify([year, driverKey])} year={year} values={values} />
    <p>— No transactions for the selected technician or team.</p>
  </section>;
}
