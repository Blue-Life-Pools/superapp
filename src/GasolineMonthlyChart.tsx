import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { summarizeFuel, type FuelPurchase } from './gasolineData';
import { gasolineChemicalCoverage, type ChemicalProperty } from './gasolineChemicalCoverage';

const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const fullMonthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const compactDollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
const gallons = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat('en-US');
const monthNumbers = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));

function countVisited(properties: ChemicalProperty[] | null, month: string, names: string[], driver: string | undefined) {
  const serviced = properties?.filter(property => property.participants.length);
  if (!serviced?.length || driver === '') return null;
  if (driver === undefined) return new Set(serviced.map(property => property.id)).size;
  const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const coverage = gasolineChemicalCoverage(serviced.map(property => ({ ...property, assigned: [] })), names, month + '-01', month + '-' + last);
  return new Set(coverage.get(driver)?.filter(property => property.counted).map(property => property.id)).size;
}

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

function MonthlyBars({ year, values, visited }: { year: string; values: ({ gallons: number; dollars: number } | null)[]; visited: (number | null)[] }) {
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
          const propertyCount = visited[index];
          const propertyUnit = propertyCount === 1 ? 'property' : 'properties';
          const propertyLabel = propertyCount === null ? 'property data unavailable' : `${integer.format(propertyCount)} ${propertyUnit} visited`;
          return <li key={index} aria-label={`${name} ${label}, ${propertyLabel}`}>
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
            <div className="gasoline-chart-properties">
              {propertyCount === null ? '—' : integer.format(propertyCount)} <span>{propertyUnit}</span>
            </div>
          </li>;
        })}
      </ul>
    </div>
  </>;
}

export function GasolineMonthlyChart({ purchases, months, loadChemicalProperties }: {
  purchases: FuelPurchase[];
  months: string[];
  loadChemicalProperties: (month: string, signal: AbortSignal) => Promise<ChemicalProperty[]>;
}) {
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const [chemicalYear, setChemicalYear] = useState<{ year: string; months: (ChemicalProperty[] | null)[] } | null>(null);
  const years = [...new Set(months.map(month => month.slice(0, 4)))];
  const year = years.includes(selectedYear) ? selectedYear : years[0];
  const summaries = useMemo(() => monthNumbers.map(month =>
    summarizeFuel(purchases, year + '-' + month),
  ), [purchases, year]);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all(monthNumbers.map(month => loadChemicalProperties(year + '-' + month, controller.signal).catch(() => null)))
      .then(properties => {
        if (!controller.signal.aborted) setChemicalYear({ year, months: properties });
      });
    return () => controller.abort();
  }, [year, loadChemicalProperties]);
  const drivers = [...new Map(summaries.flatMap(summary => summary.drivers.map(driver => [driver.key, driver.name] as const)))]
    .sort((first, second) => first[1].localeCompare(second[1], 'en'));
  const driverIndex = drivers.findIndex(([key]) => key === selectedDriver);
  const driverKey = drivers[driverIndex]?.[0];
  const names = drivers.filter(([key]) => key).map(([, name]) => name);
  const visited = monthNumbers.map((month, index) =>
    countVisited(chemicalYear?.year === year ? chemicalYear.months[index] : null, year + '-' + month, names, driverKey));
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
    <MonthlyBars key={JSON.stringify([year, driverKey])} year={year} values={values} visited={visited} />
    <p>{chemicalYear?.year !== year ? 'Loading property counts from Chemicals…' : 'Property counts use monthly service records from Chemicals.'} A dash indicates missing data.</p>
  </section>;
}
