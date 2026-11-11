import { SearchField } from './SearchField';
import { WorkspaceIcon } from './WorkspaceIcon';
import type { ComponentProps, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { API_URL, apiFetch } from './api';
import type { ConsumptionFile, ConsumptionImportRow, ConsumptionChemical } from './chemicalConsumptionImport';
import { chemicalReportMonth, englishChemicalName } from './chemicalConsumptionAlerts';
import './ChemicalConsumptionPanel.css';

type Body = { id: string; name: string; technicianName: string | null; gallons: number | null; type: string; size: string | null; active: boolean };
type Property = { id: string; name: string; code: string | null; waterBodies: Body[] };
type Chemical = ConsumptionChemical & { expectedMin: number | null; expectedMax: number | null; status: string; expectedQuantity?: number; expectedMean?: number; historicalMean?: number; historicalMonths?: number; historicalFactor?: number; excludedMonths?: number[]; seasonal?: boolean; excessQuantity?: number | null; excessPercent?: number | null; referenceSource?: string | null };
type Period = { month?: string; propertyId: string; monthlyFee: number | null; feeSource: string | null; sourceName: string | null; chemicals: Chemical[]; totalCost: number; costPercent: number | null; allocation: { basis: string; totalGallons: number | null; unallocatedFee: number; unallocatedCost: number; bodies: Array<Body & { share: number; monthlyFee: number | null; chemicalCost: number; costPercent: number | null; chemicals: Chemical[] }> } };
type RecurringOverconsumption = { propertyId: string; propertyName: string; months: number; followUpCount?: number; resolved?: boolean; entries: Array<{ month: string; chemicalName: string; unit: string; quantity: number; threshold: number; excessPercent: number }> };
export type Dashboard = { properties: Property[]; periods: Period[]; recurringOverconsumption?: RecurringOverconsumption[]; followUpCounts?: Record<string, number>; history?: { year: number; matchedProperties: number; unmatchedProperties: number; preliminary: boolean } };
type Preview = ConsumptionImportRow & { matchedProperty: { id: string; name: string } | null; status: string; existing: boolean };

const money = (value: number | null) => value == null ? 'No monthly fee' : value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const quantity = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 4 });
const percent = (value: number | null) => value == null ? '—' : `${value.toFixed(1)}%`;
const sizeLabel: Record<string, string> = { SMALL: 'Small', MEDIUM: 'Medium', LARGE: 'Large', EXTRA_LARGE: 'Extra large' };

function technicianUsage(chemical: Chemical) {
  const totals = new Map<string, { name: string; occurrences: number; quantity: number; cost: number }>();
  for (const item of chemical.technicians || []) {
    const current = totals.get(item.name) || { name: item.name, occurrences: 0, quantity: 0, cost: 0 };
    current.occurrences += 1; current.quantity += item.quantity; current.cost += item.cost; totals.set(item.name, current);
  }
  return [...totals.values()].sort((a, b) => b.occurrences - a.occurrences || a.name.localeCompare(b.name));
}

function primaryTechnician(chemicals: Chemical[]) {
  const counts = new Map<string, number>();
  for (const chemical of chemicals) for (const item of chemical.technicians || []) {
    if (item.name.toLowerCase().includes('georky')) continue;
    counts.set(item.name, (counts.get(item.name) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || '';
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await apiFetch(`${API_URL}/chemicals/consumption${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message || 'Unable to complete the operation.');
  return data as T;
}
const post = (data: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

function ConsumptionMetric({ icon, label, value, hint, alert = false }: { icon: ComponentProps<typeof WorkspaceIcon>['name']; label: string; value: ReactNode; hint?: string; alert?: boolean }) {
  return <article className={`consumption-metric${alert ? ' consumption-metric-alert' : ''}`}><WorkspaceIcon name={icon} /><div><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div></article>;
}

export function ChemicalConsumptionPanel() {
  const [month, setMonth] = useState(() => chemicalReportMonth());
  const [dashboard, setDashboard] = useState<Dashboard>({ properties: [], periods: [] });
  const [propertyId, setPropertyId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [monthlyFee, setMonthlyFee] = useState('');
  const [pending, setPending] = useState<ConsumptionFile | null>(null);
  const [preview, setPreview] = useState<Preview[]>([]);
  const [replace, setReplace] = useState(false);
  const selectedProperty = dashboard.properties.find((property) => property.id === propertyId);
  const period = dashboard.periods.find((item) => item.propertyId === propertyId);

  async function load() {
    setLoading(true);
    try { setDashboard(await request<Dashboard>(`?month=${month}`)); setError(''); }
    catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [month]);

  async function readFile(file: File, kind: 'pdf' | 'fees') {
    setBusy(true); setError(''); setMessage('Reading file…'); setReplace(false);
    try {
      const reader = await import('./chemicalConsumptionFiles');
      const data = kind === 'pdf' ? await reader.readConsumptionPdf(file, setMessage) : await reader.readMonthlyFees(file, month);
      const matches = await request<Preview[]>('/preview', post({ month: data.month, sourceName: data.sourceName, rows: data.rows }));
      setPending(data); setPreview(matches); setMessage('Review the property matches before confirming the import.');
    } catch (cause) { setError((cause as Error).message); setMessage(''); }
    finally { setBusy(false); }
  }
  async function importFile() {
    if (!pending) return;
    setBusy(true); setError('');
    try {
      const rows = preview.filter((row) => row.matchedProperty).map((row) => ({ propertyName: row.propertyName, code: row.code, addressLine1: row.addressLine1, propertyId: row.matchedProperty!.id, monthlyFee: row.monthlyFee, chemicals: row.chemicals }));
      if (!rows.length) throw new Error('Match at least one property.');
      const result = await request<{ imported: number; skipped: number }>('/import', post({ month: pending.month, sourceName: pending.sourceName, rows, replace }));
      setPending(null); setPreview([]); setMessage(`${result.imported} properties imported; ${result.skipped} existing records preserved.`);
      if (month !== pending.month) setMonth(pending.month); else await load();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function saveFee() {
    if (!propertyId || !monthlyFee.trim()) return;
    setBusy(true); setError('');
    try {
      const saved = await request<Period>(`/${propertyId}/${month}`, { ...post({ monthlyFee: Number(monthlyFee), budgetPercent: null, seasonFactor: 1, references: [] }), method: 'PATCH' });
      setDashboard((current) => ({ ...current, periods: [...current.periods.filter((item) => item.propertyId !== propertyId), saved] }));
      setMessage('Monthly fee saved.');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  const importedCost = dashboard.periods.reduce((sum, item) => sum + item.totalCost, 0);
  const overconsumption = dashboard.periods.filter((item) => item.sourceName && item.monthlyFee != null && item.monthlyFee > 0 && (item.costPercent || 0) > 20).map((item) => ({ period: item, propertyName: dashboard.properties.find((property) => property.id === item.propertyId)?.name || item.propertyId, technician: primaryTechnician(item.chemicals) })).sort((a, b) => (b.period.costPercent || 0) - (a.period.costPercent || 0) || a.propertyName.localeCompare(b.propertyName));
  const reportTechnician = period ? primaryTechnician(period.chemicals) : '';

  return <section className="consumption-panel consumption-dashboard" aria-label="Property consumption" aria-busy={loading}>
    <div className="consumption-toolbar"><label className="consumption-month-field"><span>Month</span><span className="consumption-month-input"><WorkspaceIcon name="calendar" /><input aria-label="Consumption month" type="month" value={month} disabled={busy} onChange={(event) => event.target.value && setMonth(event.target.value)} /></span></label><div className="consumption-import-actions"><label className="secondary-button"><WorkspaceIcon name="upload" />Upload Skimmer PDF<input aria-label="Upload Skimmer PDF" type="file" accept=".pdf" disabled={busy || loading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file, 'pdf'); event.target.value = ''; }} /></label><button type="button" className="secondary-button" disabled={busy} onClick={() => void load()}><WorkspaceIcon name="refresh" />Refresh</button></div></div>
    {error && <p className="consumption-error" role="alert">{error}</p>}{message && <p className="consumption-message" role="status">{message}</p>}
    {pending && <section className="consumption-import-preview"><h3>Review import · {pending.month}</h3><p>{pending.sourceName} · {preview.filter((row) => row.matchedProperty).length} of {preview.length} properties matched.</p><div className="consumption-preview-list">{preview.map((row, index) => <label key={`${row.code || row.propertyName}-${index}`}><span>{row.propertyName}</span><select value={row.matchedProperty?.id || ''} disabled={busy} onChange={(event) => setPreview((current) => current.map((item, i) => i === index ? { ...item, matchedProperty: dashboard.properties.find((property) => property.id === event.target.value) || null } : item))}><option value="">Unmatched</option>{dashboard.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>)}</div><label className="consumption-replace"><input type="checkbox" checked={replace} disabled={busy} onChange={(event) => setReplace(event.target.checked)} />Replace existing data for this month</label><div className="consumption-import-actions"><button type="button" className="primary-button" disabled={busy} onClick={() => void importFile()}>Confirm import</button><button type="button" className="secondary-button" disabled={busy} onClick={() => { setPending(null); setPreview([]); }}>Cancel</button></div></section>}
    <div className="consumption-kpis consumption-company-kpis"><ConsumptionMetric icon="pool" label="Properties with consumption" value={loading ? '—' : dashboard.periods.filter((item) => item.sourceName).length} /><ConsumptionMetric icon="coins" label="Total recorded cost" value={loading ? '—' : money(importedCost)} /><ConsumptionMetric icon="warning" label="Chemical cost over 20%" value={loading ? '—' : overconsumption.length} alert={overconsumption.length > 0} /></div>
    {!loading && <section className="consumption-overview"><div className="consumption-overview-heading"><h2>Overconsumption</h2><span className="consumption-count-badge">{overconsumption.length} {overconsumption.length === 1 ? 'property' : 'properties'}</span></div>{!dashboard.periods.some((item) => item.sourceName) ? <p className="consumption-empty">No consumption recorded for this month. Upload a Skimmer PDF to evaluate chemical cost.</p> : !overconsumption.length ? <p className="consumption-empty">No property has chemical cost above 20% of its monthly fee.</p> : <div className="consumption-overage-table-wrap"><table className="consumption-overage-table"><thead><tr><th>Property</th><th>Chemical cost</th><th>Monthly fee</th><th>% of fee</th><th>Technician</th></tr></thead><tbody>{overconsumption.map(({ period: item, propertyName, technician }) => <tr key={item.propertyId}><th scope="row"><button type="button" onClick={() => { setPropertyId(item.propertyId); setSearch(propertyName); }}>{propertyName}</button><small>All chemicals · {dashboard.followUpCounts?.[item.propertyId] || 0} notes</small></th><td className="consumption-excess">{money(item.totalCost)}</td><td>{money(item.monthlyFee)}</td><td><span className="consumption-variation">{percent(item.costPercent)}</span></td><td>{technician || 'Not recorded'}</td></tr>)}</tbody></table></div>}<details className="consumption-reference-notes"><summary>Reference and evaluation details</summary><p>Alert when total recorded chemical cost is greater than 20% of the property's monthly fee. Select a property to review allocation by water body and technician distribution by chemical.</p></details></section>}
    <section className="consumption-property-card" aria-label="Property consumption detail"><header className="consumption-property-heading"><div><h2>{selectedProperty?.name || 'Select a property'}</h2><p className="consumption-muted">{selectedProperty ? `${selectedProperty.code || 'No property code'} · ${selectedProperty.waterBodies.filter((body) => body.active).length} active water bodies` : 'Search for a property to review its consumption, costs and allocation.'}</p></div><div className="consumption-property-select"><label><span>{selectedProperty ? 'Change property' : 'Property'}</span><SearchField aria-label="Search consumption properties" list="consumption-properties" placeholder="Search or select a property…" autoComplete="off" value={search} disabled={loading || busy} onChange={(event) => { const value = event.target.value; setSearch(value); const match = dashboard.properties.find((property) => property.name.toLowerCase() === value.trim().toLowerCase()); setPropertyId(match?.id || ''); }} /><datalist id="consumption-properties">{dashboard.properties.map((property) => <option key={property.id} value={property.name} />)}</datalist></label></div></header><div className="consumption-report-divider" role="separator" />
      {selectedProperty && !loading && <>{period && <div className="consumption-kpis consumption-property-kpis"><ConsumptionMetric icon="tag" label="Monthly fee" value={money(period.monthlyFee)} /><ConsumptionMetric icon="chemicals" label="Chemical cost" value={money(period.totalCost)} /><ConsumptionMetric icon="percent" label="% spent on chemicals" value={percent(period.costPercent)} alert={(period.costPercent || 0) > 20} /><ConsumptionMetric icon="drop" label="Water bodies" value={period.allocation.bodies.length} /><ConsumptionMetric icon="users" label="Technician" value={reportTechnician || 'Not recorded'} hint="Most usage entries" /></div>}<details className="consumption-property-settings" open={!period || undefined}><summary>Monthly fee</summary><form className="consumption-settings" onSubmit={(event) => { event.preventDefault(); void saveFee(); }}><label>Total monthly fee ($)<input required type="number" min="0" step="0.01" value={monthlyFee} onChange={(event) => setMonthlyFee(event.target.value)} /></label><button className="primary-button" disabled={busy}>Save monthly fee</button></form></details>{period ? <div className="consumption-property-columns"><section className="consumption-property-chemicals"><h3>Chemical consumption</h3><div className="consumption-chemical-list">{period.chemicals.map((chemical) => { const usage = technicianUsage(chemical); return <article key={`${chemical.name}-${chemical.unit}`} className="consumption-chemical consumption-recorded"><div className="consumption-chemical-summary"><WorkspaceIcon name="chemicals" /><div><strong>{englishChemicalName(chemical.name)}</strong><span>{quantity(chemical.quantity)} {chemical.unit} · {money(chemical.cost)}</span></div></div><details className="consumption-chemical-details"><summary>Usage details</summary><p>Current month only. Technician distribution is based on the number of usage entries; tank refills are not used to identify the pool technician.</p>{!!usage.length && <div className="consumption-technician-split">{usage.map((item) => <p key={item.name}><strong>{item.name.toLowerCase().includes('georky') ? `${item.name} (tank refill)` : item.name}:</strong> {quantity(item.quantity)} {chemical.unit} · {money(item.cost)} · {item.occurrences} usage {item.occurrences === 1 ? 'entry' : 'entries'}</p>)}</div>}</details></article>; })}</div></section><section className="consumption-property-allocation"><h3>Allocation by water body</h3>{(period.allocation.unallocatedFee > 0 || period.allocation.unallocatedCost > 0) && <p className="consumption-error">Unallocated: monthly fee {money(period.allocation.unallocatedFee)}, chemicals {money(period.allocation.unallocatedCost)}.</p>}<div className="consumption-body-list">{period.allocation.bodies.map((body) => <article key={body.id}><div className="consumption-body-content"><header><WorkspaceIcon name="pool" /><div><h4>{body.name}</h4><small>{body.gallons ? `${quantity(body.gallons)} GAL` : 'Volume not recorded'} · {percent(body.share * 100)}</small><small>{sizeLabel[body.size || ''] || body.type.replaceAll('_', ' ').toLowerCase()}</small></div></header><dl><div><dt>Monthly fee</dt><dd>{money(body.monthlyFee)}</dd></div><div><dt>Chemical cost</dt><dd>{money(body.chemicalCost)}</dd></div><div><dt>% of monthly fee</dt><dd>{percent(body.costPercent)}</dd></div></dl></div><details><summary>Estimated quantities by chemical</summary>{body.chemicals.map((chemical) => <p key={`${chemical.name}-${chemical.unit}`}><strong>{englishChemicalName(chemical.name)}</strong><span>{quantity(chemical.quantity)} {chemical.unit} · {money(chemical.cost)}</span></p>)}</details></article>)}</div><details className="consumption-allocation-method"><summary>Allocation method</summary><p>{period.allocation.basis === 'GALLONS' ? `Proportional to ${quantity(period.allocation.totalGallons!)} recorded gallons.` : 'Equal shares for pools; one pool and one spa use 80% / 20%; mixed pools and fountains use pool size and body-type references, splitting each unknown fountain equally.'} Chemical quantities and costs are estimates allocated from the property total.</p></details></section></div> : <p className="consumption-empty">Upload a Skimmer report and save the monthly fee to view this property\'s analysis.</p>}</>}
    </section>
  </section>;
}
