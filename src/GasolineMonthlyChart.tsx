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
type ChemicalLoader = (month: string, signal: AbortSignal) => Promise<ChemicalProperty[]>;
type MonthlySeries = { year: string; values: ({ gallons: number; dollars: number } | null)[]; visited: (number | null)[] };

function useChemicalYear(year: string, loadChemicalProperties: ChemicalLoader) {
  const [result, setResult] = useState<{ year: string; months: (ChemicalProperty[] | null)[] } | null>(null);
  useEffect(() => {
    if (!year) return;
    const controller = new AbortController();
    void Promise.all(monthNumbers.map(month => loadChemicalProperties(year + '-' + month, controller.signal).catch(() => null)))
      .then(months => {
        if (!controller.signal.aborted) setResult({ year, months });
      });
    return () => controller.abort();
  }, [year, loadChemicalProperties]);
  return result?.year === year ? result.months : null;
}

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

function MonthlyBars({ series }: { series: MonthlySeries[] }) {
  const comparing = series.length > 1;
  const volumes = series.flatMap(({ values }) => values.map(value => value?.gallons ?? 0));
  const maximum = Math.max(0, ...volumes);
  const minimum = Math.min(0, ...volumes);
  const range = maximum - minimum || 1;
  const baseline = minimum === 0 ? 100 : maximum / range * 100;

  return <>
    <p className="gasoline-chart-legend"><span>Gallons purchased</span> Select a spending amount for details.</p>
    <div className="gasoline-chart-scroll" role="region" aria-label="Monthly fuel chart" tabIndex={0}
      onScroll={event => event.currentTarget.querySelector<HTMLElement>('.gasoline-spending-popover:popover-open')?.hidePopover()}>
      <ul className={`gasoline-chart${comparing ? ' is-comparing' : ''}`} role="list">
        {monthNumbers.flatMap((number, index) => series.map(({ year, values, visited }, seriesIndex) => {
          const value = values[index];
          const month = new Date(Date.UTC(Number(year), index, 1));
          const name = fullMonthLabel.format(month) + (comparing ? ' ' + year : '');
          const label = value ? `${gallons.format(value.gallons)} gallons, ${dollars.format(value.dollars)}` : 'no transactions';
          const height = (value?.gallons ?? 0) / range * 100;
          const propertyCount = visited[index];
          const propertyUnit = propertyCount === 1 ? 'property' : 'properties';
          const propertyLabel = propertyCount === null ? 'property data unavailable' : `${integer.format(propertyCount)} ${propertyUnit} visited`;
          return <li key={year + number} className={seriesIndex ? 'is-second-year' : undefined} aria-label={`${name} ${label}, ${propertyLabel}`}>
            <div className="gasoline-chart-plot" aria-hidden="true">
              <span className="gasoline-chart-zero" style={{ top: `${baseline}%` }} />
              {!!height && <span className={`gasoline-chart-bar${height < 0 ? ' is-credit' : ''}`}
                style={{ top: `${baseline - Math.max(0, height)}%`, height: `${Math.abs(height)}%` }} />}
              {value && <strong className="gasoline-chart-volume" style={{ top: `${baseline - Math.max(0, height)}%` }}>{gallons.format(value.gallons)}</strong>}
            </div>
            <span className="gasoline-chart-month">{monthLabel.format(month)}{comparing && <small>{year}</small>}</span>
            <div className="gasoline-chart-spending">
              {value ? <FuelSpending month={name} amount={value.dollars} volume={value.gallons} /> : <span>—</span>}
            </div>
            <div className="gasoline-chart-properties">
              {propertyCount === null ? '—' : integer.format(propertyCount)} <span>{propertyUnit}</span>
            </div>
          </li>;
        }))}
      </ul>
    </div>
  </>;
}

export function GasolineMonthlyChart({ purchases, months, loadChemicalProperties }: {
  purchases: FuelPurchase[];
  months: string[];
  loadChemicalProperties: ChemicalLoader;
}) {
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const years = [...new Set(months.map(month => month.slice(0, 4)))];
  const availableSelection = selectedYears.filter(item => years.includes(item));
  const [year = years[0], comparison = ''] = availableSelection;
  const primaryChemicals = useChemicalYear(year, loadChemicalProperties);
  const comparisonChemicals = useChemicalYear(comparison, loadChemicalProperties);
  const summaries = useMemo(() => [year, comparison].filter(Boolean).sort().map(item => ({
    year: item,
    months: monthNumbers.map(month => summarizeFuel(purchases, item + '-' + month)),
  })), [purchases, year, comparison]);
  const drivers = [...new Map(summaries.flatMap(series => series.months.flatMap(summary => summary.drivers.map(driver => [driver.key, driver.name] as const))))]
    .sort((first, second) => first[1].localeCompare(second[1], 'en'));
  const driverIndex = drivers.findIndex(([key]) => key === selectedDriver);
  const driverKey = drivers[driverIndex]?.[0];
  const names = drivers.filter(([key]) => key).map(([, name]) => name);
  const series = summaries.map(item => {
    const chemicals = item.year === year ? primaryChemicals : comparisonChemicals;
    const visited = monthNumbers.map((month, index) =>
      countVisited(chemicals?.[index] ?? null, item.year + '-' + month, names, driverKey));
    const values = item.months.map(summary => {
      if (driverKey === undefined) {
        return summary.first ? { dollars: summary.spent / 100, gallons: summary.gallons } : null;
      }
      const driver = summary.drivers.find(candidate => candidate.key === driverKey);
      return driver ? { dollars: driver.cents / 100, gallons: driver.gallons } : null;
    });
    return { year: item.year, values, visited };
  });

  return <section className="gasoline-panel" aria-labelledby="gasoline-monthly-title">
    <div className="gasoline-section-header">
      <h2 id="gasoline-monthly-title">Monthly fuel by technician</h2>
      <div className="gasoline-chart-filters">
        <div className="gasoline-chart-year">
          <label>Year<select multiple size={Math.min(3, Math.max(2, years.length))}
            aria-describedby={years.length > 1 ? 'gasoline-year-hint' : undefined}
            value={comparison ? [year, comparison] : [year]} onChange={event => {
              const next = Array.from(event.currentTarget.selectedOptions, option => option.value);
              if (!next.length) return;
              const current = [year, comparison];
              const retained = current.filter(item => next.includes(item));
              const added = next.filter(item => !current.includes(item));
              setSelectedYears([...retained, ...added].slice(-2));
            }}>
            {years.map(item => <option key={item}>{item}</option>)}
          </select></label>
          {years.length > 1 && <small id="gasoline-year-hint">Ctrl / ⌘ + click to select two.</small>}
        </div>
        <label>Technician<select value={driverIndex} onChange={event => setSelectedDriver(drivers[Number(event.currentTarget.value)]?.[0] ?? null)}>
          <option value={-1}>All technicians</option>
          {drivers.map(([key, name], index) => <option value={index} key={key}>{name}</option>)}
        </select></label>
      </div>
    </div>
    <MonthlyBars key={JSON.stringify([year, comparison, driverKey])} series={series} />
    <p>{!primaryChemicals || (comparison && !comparisonChemicals) ? 'Loading property counts from Chemicals…' : 'Property counts use monthly service records from Chemicals.'} A dash indicates missing data.</p>
  </section>;
}
