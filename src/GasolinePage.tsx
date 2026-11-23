import { useMemo, useRef, useState, type ReactNode } from 'react';
import { readWawaTransactions, summarizeFuel, type FuelData, type FuelRoute } from './gasolineData';
import { WorkspaceIcon } from './WorkspaceIcon';
import './GasolinePage.css';

const emptyFuelData: FuelData = { purchases: [], routes: {} };
const emptyRoute: FuelRoute = { zone: '', properties: null, miles: null };
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const quantities = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const monthName = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayName = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const readDate = (day: string) => new Date(day + 'T00:00:00Z');
const positiveNumber = (value: number) => Number.isFinite(value) && value > 0 ? value : null;

function readHistory(key: string): FuelData {
  try {
    const data = JSON.parse(localStorage.getItem(key) ?? 'null') as FuelData | null;
    return Array.isArray(data?.purchases) && data?.routes ? data : emptyFuelData;
  } catch {
    return emptyFuelData;
  }
}

export function GasolinePage({ sidebar, userId }: { sidebar: ReactNode; userId: string }) {
  const key = `bluelife-gasoline-v1:${userId}`;
  const [history, setHistory] = useState(() => readHistory(key));
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const [sort, setSort] = useState<'gallons' | 'spend' | 'perProperty' | 'efficiency'>('gallons');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showAll, setShowAll] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const months = useMemo(() => [...new Set(history.purchases.map(purchase => purchase.date.slice(0, 7)))].sort().reverse(), [history.purchases]);
  const month = months.includes(selectedMonth) ? selectedMonth : months[0] ?? '';
  const summary = useMemo(() => summarizeFuel(history.purchases, month), [history.purchases, month]);
  const routeKey = (driver: string) => JSON.stringify([summary.first, summary.last, driver]);
  const rows = summary.drivers.map(driver => {
    const route = history.routes[routeKey(driver.key)] ?? emptyRoute;
    return {
      ...driver, route, spend: driver.cents / 100,
      perProperty: route.properties === null ? null : driver.cents / 100 / route.properties,
      efficiency: route.miles === null ? null : driver.gallons * 100 / route.miles,
    };
  }).sort((first, second) => (second[sort] ?? -Infinity) - (first[sort] ?? -Infinity) || first.name.localeCompare(second.name));
  const visibleRows = showAll ? rows : rows.slice(0, 8);
  const driver = rows.find(row => row.key === selectedDriver) ?? visibleRows[0];
  const largestPurchases = driver?.purchases.filter(purchase => purchase.gallons > 0).sort((a, b) => b.gallons - a.gallons).slice(0, 3) ?? [];

  function save(next: FuelData) {
    localStorage.setItem(key, JSON.stringify(next));
    setHistory(next);
  }

  async function importWorkbook(file: File) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const purchases = await readWawaTransactions(file);
      const existing = readHistory(key);
      const merged = new Map(existing.purchases.map(purchase => [purchase.id, purchase]));
      for (const purchase of purchases) merged.set(purchase.id, purchase);
      const newCount = merged.size - existing.purchases.length;
      save({ ...existing, purchases: [...merged.values()] });
      setSelectedMonth(purchases.reduce((last, purchase) => purchase.date > last ? purchase.date : last, '').slice(0, 7));
      setSelectedDriver(null);
      setShowAll(false);
      setMessage(`Report imported. ${newCount} new ${newCount === 1 ? 'transaction' : 'transactions'}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not import the Wawa report.');
    } finally {
      setBusy(false);
    }
  }

  function updateRoute(changes: Partial<FuelRoute>) {
    if (!driver?.key) return;
    try {
      const existing = readHistory(key);
      const driverPeriod = routeKey(driver.key);
      const route = existing.routes[driverPeriod] ?? emptyRoute;
      save({ ...existing, routes: { ...existing.routes, [driverPeriod]: { ...route, ...changes } } });
      setError('');
    } catch {
      setError('Could not save the route data in this browser.');
    }
  }

  return <div className="page app-page gasoline-page">
    {sidebar}
    <main className="gasoline-content" aria-labelledby="gasoline-title">
      <header className="area-page-header gasoline-header">
        <div><span className="area-eyebrow">FLEET OPERATIONS</span><h1 id="gasoline-title">Gasoline</h1><p>Review monthly Wawa fuel purchases and compare technicians across service routes.</p></div>
        <button type="button" className="gasoline-upload" disabled={busy} onClick={() => upload.current?.click()}><WorkspaceIcon name="upload" />{busy ? 'Importing…' : 'Import Wawa Excel'}</button>
        <input ref={upload} type="file" hidden accept=".xlsx" aria-label="Wawa Transactions Excel" onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void importWorkbook(file);
        }} />
      </header>
      <p className="gasoline-storage">Imports and route data are saved for this account in this browser.</p>
      {error && <p className="gasoline-message is-error" role="alert">{error}</p>}
      {message && <p className="gasoline-message" role="status">{message}</p>}
      {!month ? <section className="gasoline-panel gasoline-empty"><h2>No fuel transactions yet</h2><p>Import the Wawa Transactions Excel to see spending, gallons and purchases by driver.</p></section> : <>
        <div className="gasoline-toolbar">
          <label>Purchase month<select value={month} onChange={event => {
            setSelectedMonth(event.currentTarget.value);
            setSelectedDriver(null);
            setShowAll(false);
          }}>{months.map(item => <option key={item} value={item}>{monthName.format(readDate(item + '-01'))}</option>)}</select></label>
          <p>Purchase dates in report · {dayName.format(readDate(summary.first))}–{dayName.format(readDate(summary.last))}</p>
        </div>
        <div className="gasoline-metrics" aria-label="Fuel totals">
          <div><WorkspaceIcon name="coins" /><p>Fuel spending<strong>{dollars.format(summary.spent / 100)}</strong></p></div>
          <div><WorkspaceIcon name="drop" /><p>Gallons purchased<strong>{quantities.format(summary.gallons)}</strong></p></div>
          <div><WorkspaceIcon name="gasoline" /><p>Fill-ups<strong>{summary.charges}</strong></p></div>
        </div>
        <section className="gasoline-panel" aria-labelledby="gasoline-drivers">
          <div className="gasoline-section-header"><h2 id="gasoline-drivers">Fuel by driver</h2><label>Sort by<select value={sort} onChange={event => {
            setSort(event.currentTarget.value as typeof sort);
            setSelectedDriver(null);
          }}><option value="gallons">Gallons</option><option value="spend">Spending</option><option value="perProperty">Cost per property</option><option value="efficiency">Gallons per 100 mi</option></select></label></div>
          <div className="gasoline-table-wrap" role="region" aria-label="Fuel and route metrics by driver" tabIndex={0}>
            <table className="gasoline-table"><thead><tr><th scope="col">Driver / zone</th><th scope="col">Gallons</th><th scope="col">Spending</th><th scope="col">Fill-ups</th><th scope="col">Properties</th><th scope="col">$/property</th><th scope="col">Gal / 100 mi</th></tr></thead>
              <tbody>{visibleRows.map(row => <tr key={row.key} className={row.key === driver?.key ? 'is-selected' : undefined}>
                <th scope="row"><button type="button" aria-pressed={row.key === driver?.key} onClick={() => setSelectedDriver(row.key)}>{row.name}</button>{row.route.zone && <small>{row.route.zone}</small>}</th>
                <td>{quantities.format(row.gallons)}</td><td>{dollars.format(row.spend)}</td><td>{row.charges}</td><td>{row.route.properties ?? '—'}</td>
                <td>{row.perProperty === null ? '—' : dollars.format(row.perProperty)}</td><td>{row.efficiency === null ? '—' : quantities.format(row.efficiency)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {rows.length > 8 && <button type="button" className="gasoline-link" aria-expanded={showAll} onClick={() => {
            if (showAll && !rows.slice(0, 8).some(row => row.key === selectedDriver)) setSelectedDriver(null);
            setShowAll(!showAll);
          }}>{showAll ? 'Show first 8 drivers' : `Show all ${rows.length} drivers`}</button>}
        </section>
        {driver && <section className="gasoline-panel" aria-labelledby="gasoline-route">
          <h2 id="gasoline-route">{driver.name}</h2>
          {driver.key && <>
            <p>Enter service data for the purchase dates shown above.</p>
            <div className="gasoline-route-fields">
              <label>Service zone<input type="text" maxLength={60} value={driver.route.zone} onChange={event => updateRoute({ zone: event.currentTarget.value })} /></label>
              <label>Unique properties served<input type="number" min="1" step="1" value={driver.route.properties ?? ''} onChange={event => {
                const value = event.currentTarget.valueAsNumber;
                updateRoute({ properties: Number.isInteger(value) ? positiveNumber(value) : null });
              }} /></label>
              <label>Verified miles<input type="number" min="0.01" step="0.01" value={driver.route.miles ?? ''} onChange={event => updateRoute({ miles: positiveNumber(event.currentTarget.valueAsNumber) })} /></label>
            </div>
          </>}
          {largestPurchases.length > 0 && <>
            <h3>Largest fill-ups</h3>
            <div className="gasoline-table-wrap">
              <table className="gasoline-table gasoline-purchases"><thead><tr><th scope="col">Date</th><th scope="col">City</th><th scope="col">Product</th><th scope="col">Gallons</th><th scope="col">Spending</th></tr></thead>
                <tbody>{largestPurchases.map(purchase => <tr key={purchase.id}><td>{dayName.format(readDate(purchase.date))}</td><td>{purchase.city || '—'}</td><td>{purchase.product || '—'}</td><td>{quantities.format(purchase.gallons)}</td><td>{dollars.format(purchase.cents / 100)}</td></tr>)}</tbody>
              </table>
            </div>
          </>}
        </section>}
        {summary.largestDistance >= 1000 && <p className="gasoline-message is-review"><WorkspaceIcon name="warning" />Verify odometer readings before comparing mileage. The report includes a reading of {quantities.format(summary.largestDistance)} miles between fill-ups.</p>}
      </>}
    </main>
  </div>;
}
