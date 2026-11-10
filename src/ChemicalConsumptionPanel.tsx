import { SearchField } from './SearchField';
import { WorkspaceIcon } from './WorkspaceIcon';
import type { ComponentProps, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { API_URL, apiFetch } from './api';
import type { ConsumptionFile, ConsumptionImportRow, ConsumptionChemical } from './chemicalConsumptionImport';
import { chemicalReportMonth, chlorineOverages, englishChemicalName, isChlorineChemical } from './chemicalConsumptionAlerts';
import './ChemicalConsumptionPanel.css';

type Property = { id: string; name: string; code: string | null; chemicalFollowUpResolvedAt?: string | null; chemicalFollowUpResolution?: string | null; waterBodies: Array<{ id: string; name: string; technicianName: string | null; gallons: number | null; type: string; size: string | null; active: boolean }> };
type Reference = { name: string; unit: string; min?: number; max?: number };
type Chemical = ConsumptionChemical & { expectedMin: number | null; expectedMax: number | null; status: string; referenceSource?: string | null; expectedQuantity?: number; historicalMean?: number; historicalMonths?: number; historicalFactor?: number; excludedMonths?: number[]; seasonal?: boolean; excessQuantity?: number | null; excessPercent?: number | null };
type Period = { month?: string; propertyId: string; monthlyFee: number | null; feeSource: string | null; sourceName: string | null; chemicals: Chemical[]; references: Reference[]; seasonFactor: number; budgetPercent: number | null; budget: number | null; overBudget: boolean; totalCost: number; costPercent: number | null; allocation: { basis: string; totalGallons: number | null; unallocatedFee: number; unallocatedCost: number; bodies: Array<Property['waterBodies'][number] & { share: number; monthlyFee: number | null; chemicalCost: number; costPercent: number | null; chemicals: ConsumptionChemical[] }> } };
type RecurringOverconsumption = { propertyId: string; propertyName: string; months: number; followUpCount?: number; resolved?: boolean; entries: Array<{ month: string; chemicalName: string; unit: string; quantity: number; threshold: number; excessPercent: number }> };
export type Dashboard = { properties: Property[]; periods: Period[]; recurringOverconsumption?: RecurringOverconsumption[]; followUpCounts?: Record<string, number>; history?: { year: number; matchedProperties: number; unmatchedProperties: number; preliminary: boolean } };
type Preview = ConsumptionImportRow & { matchedProperty: { id: string; name: string } | null; status: string; existing: boolean };
const money = (value: number | null) => value === null ? 'No monthly fee' : value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const quantity = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 4 });
const percent = (value: number | null) => value === null ? '—' : `${value.toFixed(2)}%`;
const sizeLabel: Record<string, string> = { SMALL: 'Small', MEDIUM: 'Medium', LARGE: 'Large', EXTRA_LARGE: 'Extra large' };
function technicianSplit(chemical: ConsumptionChemical) {
  const usage = chemical.technicians || [];
  const georky = usage.filter((item) => item.name.toLowerCase().includes('georky')).reduce((total, item) => ({ quantity: total.quantity + item.quantity, cost: total.cost + item.cost }), { quantity: 0, cost: 0 });
  const others = usage.filter((item) => !item.name.toLowerCase().includes('georky')).reduce((total, item) => ({ quantity: total.quantity + item.quantity, cost: total.cost + item.cost }), { quantity: 0, cost: 0 });
  return { georky, others };
}
function isLiquidChlorine(chemical: ConsumptionChemical) {
  return chemical.name.toLowerCase().includes('liquid chlorine');
}
function otherTechnicians(chemical: ConsumptionChemical) {
  return (chemical.technicians || []).filter((item) => !item.name.toLowerCase().includes('georky'));
}
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await apiFetch(`${API_URL}/chemicals/consumption${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message || 'Unable to complete the operation.');
  return data as T;
}
const post = (data: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

function ConsumptionMetric({ icon, label, value, hint, alert = false, compact = false }: { icon: ComponentProps<typeof WorkspaceIcon>['name']; label: string; value: ReactNode; hint?: string; alert?: boolean; compact?: boolean }) {
  return <article className={`consumption-metric${alert ? ' consumption-metric-alert' : ''}${compact ? ' consumption-metric-compact' : ''}`}><WorkspaceIcon name={icon} /><div><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div></article>;
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
  const [budgetPercent, setBudgetPercent] = useState('');
  const [seasonFactor, setSeasonFactor] = useState('1');
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
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setDashboard({ properties: [], periods: [] });
    void request<Dashboard>(`?month=${month}`).then((data) => { if (!cancelled) { setDashboard(data); setError(''); } }).catch((cause) => { if (!cancelled) setError((cause as Error).message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [month]);
  useEffect(() => {
    setMonthlyFee(period?.monthlyFee === null || period?.monthlyFee === undefined ? '' : String(period.monthlyFee));
    setBudgetPercent(period?.budgetPercent == null ? '' : String(period.budgetPercent));
    setSeasonFactor(String(period?.seasonFactor || 1));
  }, [period, propertyId]);
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
  async function save() {
    if (!propertyId) return;
    setBusy(true); setError('');
    try {
      if (!monthlyFee.trim()) throw new Error('Enter the total monthly fee for this property.');
      const data = { monthlyFee: Number(monthlyFee), budgetPercent: budgetPercent === '' ? null : Number(budgetPercent), seasonFactor: Number(seasonFactor), references: period?.references || [] };
      const saved = await request<Period>(`/${propertyId}/${month}`, { ...post(data), method: 'PATCH' });
      setDashboard((current) => ({ ...current, periods: [...current.periods.filter((item) => item.propertyId !== propertyId), saved] }));
      setMessage('Monthly fee and budget saved for this month.');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  const importedCost = dashboard.periods.reduce((sum, item) => sum + item.totalCost, 0);
  const overconsumption = chlorineOverages(dashboard.periods).map((item) => ({ ...item, propertyName: dashboard.properties.find((property) => property.id === item.propertyId)?.name || item.propertyId, technicianNames: [...new Set((dashboard.properties.find((property) => property.id === item.propertyId)?.waterBodies || []).map((body) => body.technicianName?.trim()).filter(Boolean) as string[])].join(', '), chemicalCostPercent: dashboard.periods.find((period) => period.propertyId === item.propertyId)?.costPercent ?? -1 })).sort((a, b) => b.chemicalCostPercent - a.chemicalCostPercent || (b.chemical.excessPercent ?? 0) - (a.chemical.excessPercent ?? 0));
  const overconsumptionProperties = new Set(overconsumption.map((item) => item.propertyId)).size;
  const reviewedProperties = dashboard.periods.filter((item) => item.chemicals.some((chemical) => isChlorineChemical(chemical.name) && chemical.expectedMax != null)).length;
  const reportTechnicians = selectedProperty && period ? [...new Set(period.chemicals.flatMap((chemical) => (isLiquidChlorine(chemical) ? chemical.technicians || [] : []).filter((item) => !item.name.toLowerCase().includes('georky')).map((item) => item.name)))].join(', ') : '';
  return <section className="consumption-panel consumption-dashboard" aria-label="Property consumption" aria-busy={loading}>
    <div className="consumption-toolbar">
      <label className="consumption-month-field"><span>Month</span><span className="consumption-month-input"><WorkspaceIcon name="calendar" /><input aria-label="Consumption month" type="month" lang="en" value={month} disabled={busy} onChange={(event) => { if (event.target.value) { setMonth(event.target.value); setPending(null); } }} /></span></label>
      <div className="consumption-import-actions">
        <label className="secondary-button"><WorkspaceIcon name="upload" />{busy ? 'Processing…' : 'Upload Skimmer PDF'}<input aria-label="Upload Skimmer PDF" type="file" accept=".pdf" disabled={busy || loading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file, 'pdf'); event.target.value = ''; }} /></label>
        <label className="secondary-button"><WorkspaceIcon name="sheet" />Upload Monthly Fees (Excel)<input aria-label="Upload monthly fees" type="file" accept=".xlsx" disabled={busy || loading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file, 'fees'); event.target.value = ''; }} /></label>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => void load()}><WorkspaceIcon name="refresh" />Refresh</button>
      </div>
    </div>
    <details className="consumption-import-help"><summary>About monthly fee imports</summary><p>To import monthly fees from the QuickBooks Transaction Report, select a month first. Only maintenance invoices are included; repairs and extra chemical charges are excluded.</p></details>
    {error && <p className="consumption-error" role="alert">{error}</p>}{message && <p className="consumption-message" role="status">{message}</p>}
    {pending && <section className="consumption-import-preview"><h3>Review import · {pending.month}</h3><p>{pending.sourceName} · {preview.filter((row) => row.matchedProperty).length} of {preview.length} properties matched. Unmatched rows are excluded.</p>{pending.warnings.length > 0 && <details><summary>{pending.warnings.length} review notices</summary>{pending.warnings.map((warning) => <p key={warning}>{warning}</p>)}</details>}<div className="consumption-preview-list">{preview.map((row, index) => <label key={`${row.code || row.propertyName}-${index}`}><span>{row.propertyName}{row.addressLine1 && <small>{row.addressLine1}</small>}{row.existing && <small>Already has data for this month</small>}</span><select value={row.matchedProperty?.id || ''} disabled={busy} onChange={(event) => setPreview((current) => current.map((item, i) => i === index ? { ...item, matchedProperty: dashboard.properties.find((property) => property.id === event.target.value) || null } : item))}><option value="">Unmatched</option>{dashboard.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>)}</div><label className="consumption-replace"><input type="checkbox" checked={replace} disabled={busy} onChange={(event) => setReplace(event.target.checked)} />Replace existing data for this month with the uploaded file</label><div className="consumption-import-actions"><button type="button" className="primary-button" disabled={busy} onClick={() => void importFile()}>Confirm import</button><button type="button" className="secondary-button" disabled={busy} onClick={() => { setPending(null); setPreview([]); }}>Cancel</button></div></section>}
    <div className="consumption-kpis consumption-company-kpis">
      <ConsumptionMetric icon="pool" label="Properties with consumption" value={loading ? '—' : dashboard.periods.filter((item) => item.sourceName).length} />
      <ConsumptionMetric icon="coins" label="Total recorded cost" value={loading ? '—' : money(importedCost)} />
      <ConsumptionMetric icon="warning" label="Chlorine overconsumption" value={loading ? '—' : overconsumptionProperties} alert={overconsumptionProperties > 0} />
    </div>
    {!loading && <section className="consumption-overview">
      <div className="consumption-overview-heading"><h2>Overconsumption</h2><span className="consumption-count-badge">{overconsumptionProperties} {overconsumptionProperties === 1 ? 'property' : 'properties'}</span></div>
      {!dashboard.periods.some((item) => item.sourceName) ? <p className="consumption-empty">No consumption recorded for this month. Upload a Skimmer PDF to evaluate overconsumption.</p> : !overconsumption.length ? <p className="consumption-empty">No chlorine overconsumption detected in evaluable properties. Properties without a chlorine reference remain unevaluated.</p> : <div className="consumption-overage-table-wrap"><table className="consumption-overage-table">
        <thead><tr><th>Property</th><th>Recorded usage</th><th>Threshold</th><th>Excess</th><th>Variation</th></tr></thead>
        <tbody>{overconsumption.map(({ propertyId: id, propertyName, technicianNames, chemical }) => <tr key={`${id}-${chemical.name}-${chemical.unit}`}>
          <th scope="row"><button type="button" onClick={() => { setPropertyId(id); setSearch(propertyName); }}>{propertyName}</button><small>{englishChemicalName(chemical.name)}<span title="Follow-up notes"> · {dashboard.followUpCounts?.[id] || 0} notes</span></small>{technicianNames && <small>Technician: {technicianNames}</small>}</th>
          <td>{quantity(chemical.quantity)} <small>{chemical.unit}</small></td><td>{quantity(chemical.expectedMax!)} <small>{chemical.unit}</small></td>
          <td className="consumption-excess">{quantity(chemical.excessQuantity ?? chemical.quantity - chemical.expectedMax!)} {chemical.unit}</td>
          <td><span className="consumption-variation">{chemical.excessPercent != null ? `+${chemical.excessPercent.toFixed(1)}%` : '—'}</span></td>
        </tr>)}</tbody>
      </table></div>}
      <details className="consumption-reference-notes"><summary>Reference and evaluation details</summary><p>{reviewedProperties} properties with evaluable chlorine consumption. Includes liquid chlorine and tablets.</p>{dashboard.history && <p>2025 history: {dashboard.history.matchedProperties} properties matched; {dashboard.history.unmatchedProperties} without a unique match. Chlorine comparisons use history excluding outliers, adjusted for month length and seasonality where supported.</p>}</details>
    </section>}
    <section className="consumption-property-card" aria-label="Property consumption detail">
      <header className="consumption-property-heading"><div><h2>{selectedProperty?.name || 'Select a property'}</h2><p className="consumption-muted">{selectedProperty ? <><WorkspaceIcon name="reports" />{selectedProperty.code || 'No property code'} · {selectedProperty.waterBodies.filter((body) => body.active).length} active water {selectedProperty.waterBodies.filter((body) => body.active).length === 1 ? 'body' : 'bodies'}</> : 'Search for a property to review its consumption, costs and allocation.'}</p></div>
        <div className="consumption-property-select"><label><span>{selectedProperty ? 'Change property' : 'Property'}</span><SearchField aria-label="Search consumption properties" list="consumption-properties" placeholder="Search or select a property…" autoComplete="off" value={search} disabled={loading || busy} onChange={(event) => { const value = event.target.value; setSearch(value); const match = dashboard.properties.find((property) => property.name.toLowerCase() === value.trim().toLowerCase()); setPropertyId(match?.id || ''); }} /><datalist id="consumption-properties">{dashboard.properties.map((property) => <option key={property.id} value={property.name} />)}</datalist></label></div>
      </header>
      <div className="consumption-report-divider" role="separator" aria-label="Property report" />
      {loading && <p role="status">Loading consumption and profiles…</p>}
      {selectedProperty && !loading && <>
        {period && <div className="consumption-kpis consumption-property-kpis">
          <ConsumptionMetric icon="tag" label="Monthly fee" value={money(period.monthlyFee)} />
          <ConsumptionMetric icon="chemicals" label="Chemical cost" value={money(period.totalCost)} />
          <ConsumptionMetric icon="percent" label="% spent on chemicals" value={percent(period.costPercent)} hint={period.budget === null ? 'No budget set' : `Budget: ${money(period.budget)}`} alert={period.overBudget} />
          <ConsumptionMetric icon="drop" label="Water bodies" value={selectedProperty.waterBodies.filter((body) => body.active).length} />
          <ConsumptionMetric icon="users" label="Technician(s)" value={reportTechnicians || 'Not recorded'} hint="From Skimmer report" compact />
        </div>}
        <details className="consumption-property-settings" open={!period || undefined}><summary><WorkspaceIcon name="edit" />Monthly fee and budget</summary>
          <form className="consumption-settings" onSubmit={(event) => { event.preventDefault(); void save(); }}><label>Total monthly fee ($)<input required type="number" min="0" step="0.01" value={monthlyFee} onChange={(event) => setMonthlyFee(event.target.value)} /></label><label>Chemical budget (%)<input type="number" min="0" max="100" step="0.1" placeholder="No limit set" value={budgetPercent} onChange={(event) => setBudgetPercent(event.target.value)} /></label><button className="primary-button" disabled={busy}>Save monthly fee</button></form>
        </details>
        {period ? <div className="consumption-property-columns">
          <section className="consumption-property-chemicals"><h3>Chemical consumption</h3>
            <div className="consumption-chemical-list">{period.chemicals.map((chemical) => {
              const chlorine = isChlorineChemical(chemical.name); const evaluated = chlorine && chemical.expectedMax != null; const high = evaluated && chemical.status === 'HIGH'; const split = technicianSplit(chemical);
              return <article key={`${chemical.name}-${chemical.unit}`} className={`consumption-chemical consumption-${chlorine ? chemical.status.toLowerCase() : 'recorded'}`}>
                <div className="consumption-chemical-summary"><WorkspaceIcon name="chemicals" /><div><strong>{englishChemicalName(chemical.name)}</strong><span>{quantity(chemical.quantity)} {chemical.unit} · {money(chemical.cost)}</span></div>{high && chemical.excessPercent != null && <b className="consumption-variation">+{chemical.excessPercent.toFixed(1)}%</b>}</div>
                <details className="consumption-chemical-details"><summary>Usage details</summary><p>{!chlorine ? 'Recorded consumption · Informational only' : !evaluated ? 'Insufficient chlorine history to evaluate overconsumption' : high ? 'Chlorine overconsumption' : 'No chlorine overconsumption'}{evaluated ? ` · Monthly threshold: ${quantity(chemical.expectedMax!)} ${chemical.unit}` : ''}</p>
                  {high && <b className="consumption-excess">Excess: {quantity(chemical.excessQuantity ?? chemical.quantity - chemical.expectedMax!)} {chemical.unit}</b>}
                  {isLiquidChlorine(chemical) && !!chemical.technicians?.length && <div className="consumption-technician-split">{split.georky.quantity > 0 && <p><strong>Georky refill:</strong> {quantity(split.georky.quantity)} {chemical.unit} · {money(split.georky.cost)}</p>}{otherTechnicians(chemical).map((item) => <p key={item.name}><strong>{item.name}:</strong> {quantity(item.quantity)} {chemical.unit} · {money(item.cost)}</p>)}</div>}
                </details>
              </article>;
            })}</div>
            <details className="consumption-history-details"><summary>Historical chlorine reference</summary>{period.chemicals.filter((chemical) => isChlorineChemical(chemical.name) && chemical.referenceSource === 'HISTORY_2025').map((chemical) => <p key={`${chemical.name}-${chemical.unit}`}><strong>{englishChemicalName(chemical.name)}</strong> · Monthly mean excluding outliers: {quantity(chemical.historicalMean!)} {chemical.unit} · Expected this month: {quantity(chemical.expectedQuantity!)} {chemical.unit} · {chemical.seasonal ? `Seasonal factor: ${chemical.historicalFactor!.toFixed(2)}` : 'No reliable seasonal factor; adjusted by days only'} · {chemical.historicalMonths} recorded months, {chemical.excludedMonths?.length || 0} outliers excluded.</p>)}<p>Source: {period.sourceName || 'No consumption imported for this month'}</p></details>
          </section>
          <section className="consumption-property-allocation"><h3>Allocation by water body</h3>
            {(period.allocation.unallocatedFee > 0 || period.allocation.unallocatedCost > 0) && <p className="consumption-error">Unallocated: monthly fee {money(period.allocation.unallocatedFee)}, chemicals {money(period.allocation.unallocatedCost)}. Review active water bodies and spa caps.</p>}
            <div className="consumption-body-list">{period.allocation.bodies.map((body) => <article key={body.id}>
              <div className="consumption-body-content"><header><WorkspaceIcon name="pool" /><div><h4>{body.name}</h4><small>{body.gallons ? `${quantity(body.gallons)} GAL` : 'Volume not recorded'} · {percent(body.share * 100)}</small><small>{body.type === 'SPA' ? 'Spa · capped at $250' : sizeLabel[body.size || ''] || body.type.replaceAll('_', ' ').toLowerCase()}</small></div></header><dl><div><dt>Monthly fee</dt><dd>{money(body.monthlyFee)}</dd></div><div><dt>Chemical cost</dt><dd>{money(body.chemicalCost)}</dd></div><div><dt>% of monthly fee</dt><dd>{percent(body.costPercent)}</dd></div></dl></div>
              <details><summary>Estimated quantities by chemical</summary>{body.chemicals.map((chemical) => <p key={`${chemical.name}-${chemical.unit}`}><strong>{englishChemicalName(chemical.name)}</strong><span>{quantity(chemical.quantity)} {chemical.unit} · {money(chemical.cost)}</span></p>)}</details>
            </article>)}</div>
            <details className="consumption-allocation-method"><summary>Allocation method</summary><p>{period.allocation.basis === 'GALLONS' ? `Based on ${quantity(period.allocation.totalGallons!)} recorded gallons.` : 'Provisional by size: small $600, medium $700, large $900, extra large $1,300; spa $250.'} Water-body quantities are estimated allocations of the total recorded in Skimmer.</p></details>
          </section>
        </div> : <p className="consumption-empty">Save the monthly fee to view its size-based allocation, then upload the consumption PDF.</p>}
      </>}
    </section>
  </section>;
}
