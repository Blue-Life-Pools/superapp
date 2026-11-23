import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { API_URL, apiFetch } from './api';
import { readWawaTransactions, summarizeFuel, type FuelData, type FuelPurchase, type FuelRoute } from './gasolineData';
import { countPropertiesByCity, gasolineChemicalCoverage, type ChemicalProperty } from './gasolineChemicalCoverage';
import { GasolineMonthlyChart } from './GasolineMonthlyChart';
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

type RoutePayload = FuelRoute & { first: string; last: string; driver: string };

function readLocalHistory(key: string): FuelData {
  try {
    if (localStorage.getItem(key + ':shared')) return emptyFuelData;
    const data = JSON.parse(localStorage.getItem(key) ?? 'null') as FuelData | null;
    return Array.isArray(data?.purchases) && data?.routes ? data : emptyFuelData;
  } catch {
    return emptyFuelData;
  }
}

function localRoutes(routes: FuelData['routes']): RoutePayload[] {
  return Object.entries(routes).flatMap(([key, route]) => {
    try {
      const [first, last, driver] = JSON.parse(key) as string[];
      return first && last && driver ? [{ first, last, driver, ...route }] : [];
    } catch {
      return [];
    }
  });
}

async function request<T>(path = '', options?: RequestInit): Promise<T> {
  const response = await apiFetch(`${API_URL}/gasoline${path}`, options);
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    const message = Array.isArray(data?.message) ? data.message.join(' ') : data?.message;
    throw new Error(typeof message === 'string' ? message : 'Could not load or save shared gasoline data.');
  }
  return data as T;
}

function RouteForm({ route, busy, onSave }: { route: FuelRoute; busy: boolean; onSave: (route: FuelRoute) => void }) {
  const [draft, setDraft] = useState(route);
  return <form className="gasoline-route-form" onSubmit={event => { event.preventDefault(); onSave(draft); }}>
    <div className="gasoline-route-fields">
      <label>Service zone<input type="text" maxLength={60} value={draft.zone} onChange={event => setDraft({ ...draft, zone: event.currentTarget.value })} /></label>
      <label>Manual property count<input type="number" min="1" step="1" value={draft.properties ?? ''} onChange={event => {
        const value = event.currentTarget.valueAsNumber;
        setDraft({ ...draft, properties: Number.isInteger(value) ? positiveNumber(value) : null });
      }} /></label>
      <label>Verified miles<input type="number" min="0.01" step="0.01" value={draft.miles ?? ''} onChange={event => setDraft({ ...draft, miles: positiveNumber(event.currentTarget.valueAsNumber) })} /></label>
    </div>
    <button className="gasoline-upload" type="submit" disabled={busy}>Save route data</button>
  </form>;
}

export function GasolinePage({ sidebar, userId }: { sidebar: ReactNode; userId: string }) {
  const key = `bluelife-gasoline-v1:${userId}`;
  const [history, setHistory] = useState<FuelData>(emptyFuelData);
  const [localHistory, setLocalHistory] = useState(() => readLocalHistory(key));
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const [sort, setSort] = useState<'gallons' | 'spend'>('gallons');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [chemicalResult, setChemicalResult] = useState<{ month: string; properties: ChemicalProperty[] | null } | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadFailed(false);
    void request<FuelData>('', { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setHistory(data); })
      .catch(() => { if (!controller.signal.aborted) setLoadFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loadAttempt]);
  const months = useMemo(() => [...new Set(history.purchases.map(purchase => purchase.date.slice(0, 7)))].sort().reverse(), [history.purchases]);
  const month = months.includes(selectedMonth) ? selectedMonth : months[0] ?? '';
  const summary = useMemo(() => summarizeFuel(history.purchases, month), [history.purchases, month]);
  useEffect(() => {
    if (!month) return;
    const controller = new AbortController();
    void request<ChemicalProperty[]>(`/chemical-properties?month=${encodeURIComponent(month)}`, { signal: controller.signal })
      .then(properties => { if (!controller.signal.aborted) setChemicalResult({ month, properties }); })
      .catch(() => { if (!controller.signal.aborted) setChemicalResult({ month, properties: null }); });
    return () => controller.abort();
  }, [month]);
  const chemicals = chemicalResult?.month === month ? chemicalResult : null;
  const coverage = useMemo(
    () => gasolineChemicalCoverage(chemicals?.properties ?? [], summary.drivers.filter(driver => driver.key).map(driver => driver.name), summary.first, summary.last),
    [chemicals, summary],
  );
  const routeKey = (driver: string) => JSON.stringify([summary.first, summary.last, driver]);
  const rows = summary.drivers.map(driver => {
    const route = history.routes[routeKey(driver.key)] ?? emptyRoute;
    const chemicalProperties = coverage.get(driver.key) ?? [];
    const chemicalCount = chemicalProperties.filter(property => property.counted).length;
    const propertyCount = route.properties ?? (chemicalCount || null);
    return {
      ...driver, route, chemicalProperties, chemicalCount, propertyCount, spend: driver.cents / 100,
      cityCounts: countPropertiesByCity(chemicalProperties),
    };
  }).sort((first, second) => second[sort] - first[sort] || first.name.localeCompare(second.name));
  const visibleRows = showAll ? rows : rows.slice(0, 8);
  const driver = rows.find(row => row.key === selectedDriver) ?? visibleRows[0];
  const largestPurchases = driver?.purchases.filter(purchase => purchase.gallons > 0).sort((a, b) => b.gallons - a.gallons).slice(0, 3) ?? [];

  async function importHistory(purchases: FuelPurchase[], routes?: RoutePayload[]) {
    const result = await request<{ newPurchases: number; newRoutes: number }>('/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purchases, routes }),
    });
    setSelectedMonth(purchases.reduce((last, purchase) => purchase.date > last ? purchase.date : last, '').slice(0, 7));
    setSelectedDriver(null);
    setShowAll(false);
    setLoading(true);
    setLoadAttempt(attempt => attempt + 1);
    return result;
  }

  async function importWorkbook(file: File) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const purchases = await readWawaTransactions(file);
      const { newPurchases } = await importHistory(purchases);
      setMessage(`Report shared with the team. ${newPurchases} new ${newPurchases === 1 ? 'transaction' : 'transactions'}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not import the Wawa report.');
    } finally {
      setBusy(false);
    }
  }

  async function shareLocalHistory() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { newPurchases, newRoutes } = await importHistory(localHistory.purchases, localRoutes(localHistory.routes));
      setLocalHistory(emptyFuelData);
      try {
        localStorage.setItem(key + ':shared', '1');
      } catch {
        // The shared import has already succeeded.
      }
      setMessage(`Browser data shared. ${newPurchases} new transactions and ${newRoutes} new route records.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not share the browser data.');
    } finally {
      setBusy(false);
    }
  }

  async function saveRoute(route: FuelRoute) {
    if (!driver?.key) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { id, ...saved } = await request<FuelRoute & { id: string }>('/route', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first: summary.first, last: summary.last, driver: driver.key, ...route }),
      });
      setHistory(current => ({ ...current, routes: { ...current.routes, [id]: saved } }));
      setMessage('Route data saved for the team.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the route data.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="page app-page gasoline-page">
    {sidebar}
    <main className="gasoline-content" aria-labelledby="gasoline-title">
      <header className="area-page-header gasoline-header">
        <div><span className="area-eyebrow">FLEET OPERATIONS</span><h1 id="gasoline-title">Gasoline</h1><p>Review monthly Wawa fuel purchases and compare technicians across service routes.</p></div>
        <button type="button" className="gasoline-upload" disabled={busy || loading || loadFailed} onClick={() => upload.current?.click()}><WorkspaceIcon name="upload" />Import Wawa Excel</button>
        <input ref={upload} type="file" hidden accept=".xlsx" aria-label="Wawa Transactions Excel" onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void importWorkbook(file);
        }} />
      </header>
      <p className="gasoline-storage">Fuel history is shared with authorized CRM users.</p>
      {localHistory.purchases.length > 0 && <div className="gasoline-message is-review">
        <span>Found {localHistory.purchases.length} transactions saved in this browser from before shared history.</span>
        <button type="button" className="gasoline-link" disabled={loading || busy || loadFailed} onClick={() => void shareLocalHistory()}>Share previous browser data</button>
      </div>}
      {error && <p className="gasoline-message is-error" role="alert">{error}</p>}
      {message && <p className="gasoline-message" role="status">{message}</p>}
      {loadFailed && <div className="gasoline-message is-error" role="alert"><span>Could not load shared fuel history.</span><button type="button" className="gasoline-link" onClick={() => setLoadAttempt(attempt => attempt + 1)}>Retry</button></div>}
      {loading ? <p role="status">Loading shared fuel history…</p> : !month && !loadFailed ? <section className="gasoline-panel gasoline-empty"><h2>No fuel transactions yet</h2><p>Import the Wawa Transactions Excel to see spending, gallons and purchases by driver.</p></section> : month && <>
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
        <GasolineMonthlyChart purchases={history.purchases} months={months} />
        <section className="gasoline-panel" aria-labelledby="gasoline-drivers">
          <div className="gasoline-section-header"><h2 id="gasoline-drivers">Fuel by driver</h2><label>Sort by<select value={sort} onChange={event => {
            setSort(event.currentTarget.value as typeof sort);
            setSelectedDriver(null);
          }}><option value="gallons">Gallons</option><option value="spend">Spending</option></select></label></div>
          <p>Properties shows the purchase-period count or a saved manual count. The city breakdown uses the full selected month in Chemicals and counts each property once per technician.</p>
          {!chemicals ? <p role="status">Checking Chemicals…</p>
            : chemicals.properties === null ? <p className="gasoline-message is-review">Could not load Chemicals for this month. Manual counts can still be used.</p>
              : !chemicals.properties.length && <p className="gasoline-message is-review">No Chemicals property records for this month. Enter a manual count if needed.</p>}
          <div className="gasoline-table-wrap" role="region" aria-label="Fuel and route metrics by driver" tabIndex={0}>
            <table className="gasoline-table"><thead><tr><th scope="col">Driver / zone</th><th scope="col">Gallons</th><th scope="col">Spending</th><th scope="col">Fill-ups</th><th scope="col">Properties</th><th scope="col" className="gasoline-city-column">Properties by city</th></tr></thead>
              <tbody>{visibleRows.map(row => <tr key={row.key} className={row.key === driver?.key ? 'is-selected' : undefined}>
                <th scope="row"><button type="button" aria-pressed={row.key === driver?.key} onClick={() => setSelectedDriver(row.key)}>{row.name}</button>{row.route.zone && <small>{row.route.zone}</small>}</th>
                <td>{quantities.format(row.gallons)}</td><td>{dollars.format(row.spend)}</td><td>{row.charges}</td>
                <td>{row.propertyCount ?? (row.chemicalProperties.length ? '—' : row.key ? <a className="gasoline-link" href="#gasoline-route" onClick={() => setSelectedDriver(row.key)}>Add count</a> : '—')}
                  {!!row.chemicalProperties.length && <small><a className="gasoline-link" href="#gasoline-route" onClick={() => setSelectedDriver(row.key)}>{row.route.properties !== null ? 'Manual · View Chemicals' : row.chemicalCount ? 'From Chemicals' : `${row.chemicalProperties.length} in Chemicals this month`}</a></small>}
                </td>
                <td className="gasoline-city-column">
                  {row.cityCounts.length ? <ul className="gasoline-city-counts" role="list">
                    {row.cityCounts.map(({ city, count }) => <li key={city}>{city} <strong>{count}</strong></li>)}
                  </ul> : '—'}
                </td>
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
          {driver.chemicalProperties.length > 0 && <details className="gasoline-chemical-details" key={driver.key + month}>
            <summary>Properties in Chemicals ({driver.chemicalProperties.length})</summary>
            <p>{driver.chemicalCount} in the count for this purchase period. Older Chemicals records without dates count only when the purchase period covers the full month.</p>
            <div className="gasoline-table-wrap">
              <table className="gasoline-table gasoline-purchases gasoline-chemical-properties">
                <thead><tr><th scope="col">Property</th><th scope="col">Technician role</th><th scope="col">Recorded service dates</th><th scope="col">Counted</th></tr></thead>
                <tbody>{driver.chemicalProperties.map(property => <tr key={property.id}>
                  <th scope="row">{property.name}{property.city && <small>{property.city}</small>}</th>
                  <td>{property.assignment === 'official' ? 'Official assignment' : property.assignment === 'additional' ? 'Additional service' : 'Service recorded · assignment unconfirmed'}</td>
                  <td>{property.dates.length ? `${property.dates.length === 1 ? '1 recorded date' : `${property.dates.length} recorded dates`} · ${property.dates.map(date => dayName.format(readDate(date))).join(', ')}` : 'Dates unavailable'}</td>
                  <td>{property.counted ? 'Yes' : property.scope === 'outside range' ? 'Outside purchase dates' : 'Month only'}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </details>}
          {driver.key && <>
            <p>Enter route data for the same purchase dates. Clear the manual property count and save to use the Chemicals count.</p>
            <RouteForm key={routeKey(driver.key)} route={driver.route} busy={busy} onSave={route => void saveRoute(route)} />
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
