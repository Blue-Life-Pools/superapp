import { useEffect, useState } from 'react';
import { API_URL, apiFetch } from './api';
import type { ConsumptionFile, ConsumptionImportRow, ConsumptionChemical } from './chemicalConsumptionImport';
import { chemicalReportMonth, chlorineOverages, englishChemicalName, isChlorineChemical } from './chemicalConsumptionAlerts';
import './ChemicalConsumptionPanel.css';

type Property = { id: string; name: string; code: string | null; waterBodies: Array<{ id: string; name: string; technicianName: string | null; gallons: number | null; type: string; size: string | null; active: boolean }> };
type Reference = { name: string; unit: string; min?: number; max?: number };
type Chemical = ConsumptionChemical & { expectedMin: number | null; expectedMax: number | null; status: string; referenceSource?: string | null; expectedQuantity?: number; historicalMean?: number; historicalMonths?: number; historicalFactor?: number; excludedMonths?: number[]; seasonal?: boolean; excessQuantity?: number | null; excessPercent?: number | null };
type Period = { propertyId: string; monthlyFee: number | null; feeSource: string | null; sourceName: string | null; chemicals: Chemical[]; references: Reference[]; seasonFactor: number; budgetPercent: number | null; budget: number | null; overBudget: boolean; totalCost: number; costPercent: number | null; allocation: { basis: string; totalGallons: number | null; unallocatedFee: number; unallocatedCost: number; bodies: Array<Property['waterBodies'][number] & { share: number; monthlyFee: number | null; chemicalCost: number; costPercent: number | null; chemicals: ConsumptionChemical[] }> } };
export type Dashboard = { properties: Property[]; periods: Period[]; history?: { year: number; matchedProperties: number; unmatchedProperties: number; preliminary: boolean } };
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
      const rows = preview.filter((row) => row.matchedProperty).map((row) => ({ propertyName: row.propertyName, code: row.code, propertyId: row.matchedProperty!.id, monthlyFee: row.monthlyFee, chemicals: row.chemicals }));
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
  return <section className="consumption-panel">
    <header className="consumption-heading"><div><h2>Property consumption</h2><p>Applied quantities, cost and monthly fee allocation by water body.</p></div><label>Month<input type="month" value={month} disabled={busy} onChange={(event) => { if (event.target.value) { setMonth(event.target.value); setPending(null); } }} /></label></header>
    <p className="consumption-muted">To import monthly fees from the QuickBooks Transaction Report, select a month first. Only maintenance invoices are included; repairs and extra chemical charges are excluded.</p>
    {error && <p className="consumption-error" role="alert">{error}</p>}{message && <p className="consumption-message" role="status">{message}</p>}
    <div className="consumption-import-actions"><label className="secondary-button">{busy ? 'Processing…' : 'Upload Skimmer PDF'}<input type="file" accept=".pdf" disabled={busy || loading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file, 'pdf'); event.target.value = ''; }} /></label><label className="secondary-button">Upload monthly fees (Excel)<input type="file" accept=".xlsx" disabled={busy || loading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file, 'fees'); event.target.value = ''; }} /></label><button type="button" className="secondary-button" disabled={busy} onClick={() => void load()}>Refresh</button></div>
    {pending && <section className="consumption-import-preview"><h3>Review import · {pending.month}</h3><p>{pending.sourceName} · {preview.filter((row) => row.matchedProperty).length} of {preview.length} properties matched. Unmatched rows are excluded.</p>{pending.warnings.length > 0 && <details><summary>{pending.warnings.length} review notices</summary>{pending.warnings.map((warning) => <p key={warning}>{warning}</p>)}</details>}<div className="consumption-preview-list">{preview.map((row, index) => <label key={`${row.code || row.propertyName}-${index}`}><span>{row.propertyName}{row.existing && <small>Already has data for this month</small>}</span><select value={row.matchedProperty?.id || ''} disabled={busy} onChange={(event) => setPreview((current) => current.map((item, i) => i === index ? { ...item, matchedProperty: dashboard.properties.find((property) => property.id === event.target.value) || null } : item))}><option value="">Unmatched</option>{dashboard.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>)}</div><label className="consumption-replace"><input type="checkbox" checked={replace} disabled={busy} onChange={(event) => setReplace(event.target.checked)} />Replace existing data for this month with the uploaded file</label><div className="consumption-import-actions"><button type="button" className="primary-button" disabled={busy} onClick={() => void importFile()}>Confirm import</button><button type="button" className="secondary-button" disabled={busy} onClick={() => { setPending(null); setPreview([]); }}>Cancel</button></div></section>}
    <div className="consumption-kpis"><article><span>Properties with consumption</span><strong>{dashboard.periods.filter((item) => item.sourceName).length}</strong></article><article><span>Recorded monthly cost</span><strong>{money(importedCost)}</strong></article><article className={overconsumptionProperties > 0 ? 'consumption-high' : ''}><span>Properties with chlorine overconsumption</span><strong>{overconsumptionProperties}</strong><small>Liquid chlorine and tablets</small></article></div>
    {!loading && <section className="consumption-overview">
      <h3>Chlorine overconsumption by property</h3>
      <p className="consumption-muted">{overconsumptionProperties} properties with chlorine overconsumption · {reviewedProperties} properties with evaluable chlorine consumption. Includes liquid chlorine and tablets.</p>
      {dashboard.history && <p className="consumption-muted">2025 history: {dashboard.history.matchedProperties} properties matched; {dashboard.history.unmatchedProperties} without a unique match. Chlorine comparisons use history excluding outliers, adjusted for month length and seasonality where supported.</p>}
      {!dashboard.periods.some((item) => item.sourceName) ? <p>No consumption recorded for this month. Upload a Skimmer PDF to evaluate overconsumption.</p> : overconsumption.length === 0 ? <p>No chlorine overconsumption detected in evaluable properties. Properties without a chlorine reference remain unevaluated.</p> : <div className="consumption-overage-list">{overconsumption.map(({ propertyId: id, propertyName, technicianNames, chemical }) => <button type="button" key={`${id}-${chemical.name}-${chemical.unit}`} onClick={() => { setPropertyId(id); setSearch(propertyName); }}>
        <strong>{propertyName}</strong><span>{englishChemicalName(chemical.name)}: {quantity(chemical.quantity)} {chemical.unit} · Overconsumption threshold: {quantity(chemical.expectedMax!)} {chemical.unit}</span><span>Technician: {technicianNames || 'Not assigned'}</span><b>Excess: {quantity(chemical.excessQuantity ?? chemical.quantity - chemical.expectedMax!)} {chemical.unit}{chemical.excessPercent != null ? ` (+${chemical.excessPercent.toFixed(1)}%)` : ''}</b>
      </button>)}</div>}
    </section>}
    <div className="consumption-property-select">
      <label>Property
        <input
          list="consumption-properties"
          placeholder="Type or select a property"
          autoComplete="off"
          value={search}
          disabled={loading || busy}
          onChange={(event) => {
            const value = event.target.value;
            setSearch(value);
            const match = dashboard.properties.find((property) => property.name.toLowerCase() === value.trim().toLowerCase());
            setPropertyId(match?.id || '');
          }}
        />
        <datalist id="consumption-properties">
          {dashboard.properties.map((property) => <option key={property.id} value={property.name} />)}
        </datalist>
      </label>
    </div>
    <div className="consumption-report-divider" role="separator" aria-label="Property report" />
    {loading && <p>Loading consumption and profiles…</p>}
    {selectedProperty && !loading && <>
      <h3>{selectedProperty.name}</h3><p className="consumption-muted">{selectedProperty.code} · {selectedProperty.waterBodies.filter((body) => body.active).length} active water bodies · {period?.sourceName || 'No consumption imported for this month'}</p>
      <form className="consumption-settings" onSubmit={(event) => { event.preventDefault(); void save(); }}><label>Total monthly fee ($)<input required type="number" min="0" step="0.01" value={monthlyFee} onChange={(event) => setMonthlyFee(event.target.value)} /></label><label>Chemical budget (%)<input type="number" min="0" max="100" step="0.1" placeholder="No limit set" value={budgetPercent} onChange={(event) => setBudgetPercent(event.target.value)} /></label><button className="primary-button" disabled={busy}>Save monthly fee</button></form>
      {period && <><div className="consumption-kpis"><article><span>Monthly fee</span><strong>{money(period.monthlyFee)}</strong></article><article><span>Chemical cost</span><strong>{money(period.totalCost)}</strong></article><article className={period.overBudget ? 'consumption-high' : ''}><span>Monthly fee spent on chemicals</span><strong>{percent(period.costPercent)}</strong><small>{period.budget === null ? 'No budget set' : `Budget: ${money(period.budget)}`}</small></article><article><span>Water bodies</span><strong>{selectedProperty.waterBodies.filter((body) => body.active).length}</strong><small>Active water bodies</small></article><article><span>Technician(s)</span><strong className="consumption-kpi-technicians">{reportTechnicians || 'Not recorded'}</strong><small>From Skimmer report</small></article></div>
      <h3>Property chemical consumption</h3>
      <div className="consumption-history-details">{period.chemicals.filter((chemical) => isChlorineChemical(chemical.name) && chemical.referenceSource === 'HISTORY_2025').map((chemical) => <p key={`${chemical.name}-${chemical.unit}`}><strong>{englishChemicalName(chemical.name)}</strong> · Monthly mean excluding outliers: {quantity(chemical.historicalMean!)} {chemical.unit} · Expected this month: {quantity(chemical.expectedQuantity!)} {chemical.unit} · {chemical.seasonal ? `Seasonal factor: ${chemical.historicalFactor!.toFixed(2)}` : 'No reliable seasonal factor; adjusted by days only'} · {chemical.historicalMonths} recorded months, {chemical.excludedMonths?.length || 0} outliers excluded.</p>)}</div>
        <div className="consumption-chemical-list">{period.chemicals.map((chemical) => {
          const chlorine = isChlorineChemical(chemical.name);
          const evaluated = chlorine && chemical.expectedMax != null;
          const high = evaluated && chemical.status === 'HIGH';
          const split = technicianSplit(chemical);
          return <article key={`${chemical.name}-${chemical.unit}`} className={`consumption-chemical consumption-${chlorine ? chemical.status.toLowerCase() : 'recorded'}`}>
            <div><strong>{englishChemicalName(chemical.name)}</strong><span>{quantity(chemical.quantity)} {chemical.unit} · {money(chemical.cost)}</span>
              <small>{!chlorine ? 'Recorded consumption · Informational only' : !evaluated ? 'Insufficient chlorine history to evaluate overconsumption' : high ? 'Chlorine overconsumption' : 'No chlorine overconsumption'}
                {evaluated ? ` · Monthly threshold: ${quantity(chemical.expectedMax!)} ${chemical.unit}` : ''}
              </small>
              {high && <b className="consumption-excess">Excess: {quantity(chemical.excessQuantity ?? chemical.quantity - chemical.expectedMax!)} {chemical.unit}{chemical.excessPercent != null ? ` (+${chemical.excessPercent.toFixed(1)}%)` : ''}</b>}
              {isLiquidChlorine(chemical) && chemical.technicians?.length && <div className="consumption-technician-split">{split.georky.quantity > 0 && <p><strong>Georky refill:</strong> {quantity(split.georky.quantity)} {chemical.unit} · {money(split.georky.cost)}</p>}{otherTechnicians(chemical).map((item) => <p key={item.name}><strong>{item.name}:</strong> {quantity(item.quantity)} {chemical.unit} · {money(item.cost)}</p>)}</div>}
            </div>
          </article>;
        })}</div>
        <h3>Allocation by water body</h3><p className="consumption-muted">{period.allocation.basis === 'GALLONS' ? `Based on ${quantity(period.allocation.totalGallons!)} recorded gallons.` : 'Provisional by size: small $600, medium $700, large $900, extra large $1,300; spa $250.'} Water-body quantities are estimated allocations of the total recorded in Skimmer.</p>
        {(period.allocation.unallocatedFee > 0 || period.allocation.unallocatedCost > 0) && <p className="consumption-error">Unallocated: monthly fee {money(period.allocation.unallocatedFee)}, chemicals {money(period.allocation.unallocatedCost)}. Review active water bodies and spa caps.</p>}
        <div className="consumption-body-list">{period.allocation.bodies.map((body) => <article key={body.id}><header><div><h4>{body.name}</h4><small>{body.type === 'SPA' ? 'Spa · capped at $250' : sizeLabel[body.size || ''] || body.type} · {body.gallons ? `${quantity(body.gallons)} gal` : 'Volume not recorded'}</small></div><strong>{percent(body.share * 100)}</strong></header><dl><div><dt>Allocated monthly fee</dt><dd>{money(body.monthlyFee)}</dd></div><div><dt>Allocated chemical cost</dt><dd>{money(body.chemicalCost)}</dd></div><div><dt>% of monthly fee</dt><dd>{percent(body.costPercent)}</dd></div></dl><details><summary>View estimated quantities by chemical</summary>{body.chemicals.map((chemical) => <p key={`${chemical.name}-${chemical.unit}`}><strong>{englishChemicalName(chemical.name)}</strong><span>{quantity(chemical.quantity)} {chemical.unit} · {money(chemical.cost)}</span></p>)}</details></article>)}</div>
      </>}
      {!period && <p>Save the monthly fee to view its size-based allocation, then upload the consumption PDF.</p>}
    </>}
  </section>;
}
