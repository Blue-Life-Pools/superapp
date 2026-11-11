import { useEffect, useMemo, useState } from 'react';
import { API_URL, apiFetch } from './api';
import { chemicalReportMonth } from './chemicalConsumptionAlerts';
import { WorkspaceIcon } from './WorkspaceIcon';
import './ChemicalMonthlyFeeAlertSection.css';

type Body = { id: string; name: string; type: string; technicianName?: string | null };
type Property = { id: string; name: string; code?: string | null; waterBodies: Body[] };
type Usage = { name: string; cost: number; quantity: number };
type Chemical = { cost: number; technicians?: Usage[] };
type Period = { propertyId: string; month: string; monthlyFee: number | null; totalCost: number; costPercent: number | null; sourceName: string | null; chemicals: Chemical[] };
type Dashboard = { properties: Property[]; periods: Period[] };

const money = (value: number | null) => value == null ? '—' : value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const pct = (value: number | null) => value == null ? '—' : `${value.toFixed(1)}%`;
function bodyType(body: Body) {
  const key = `${body.type} ${body.name}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (key.includes('spa') || key.includes('jacuzzi')) return 'Spa';
  if (key.includes('fountain') || key.includes('fuente') || key.includes('decorative')) return 'Fuente';
  if (key.includes('pool') || key.includes('swimming') || key.includes('piscina')) return 'Piscina';
  return 'Otro';
}
function bodyLabel(body: Body) { return `${bodyType(body)}: ${body.name}`; }

export function ChemicalMonthlyFeeAlertSection() {
  const [month, setMonth] = useState(chemicalReportMonth);
  const [technician, setTechnician] = useState('');
  const [property, setProperty] = useState('');
  const [bodyKind, setBodyKind] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void apiFetch(`${API_URL}/chemicals/consumption?month=${month}`, { signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to load monthly fee alerts.');
      if (!controller.signal.aborted) setDashboard(data as Dashboard);
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load monthly fee alerts.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [month, refresh]);

  const propertyMap = useMemo(() => new Map((dashboard?.properties || []).map((item) => [item.id, item])), [dashboard]);
  const rows = useMemo(() => (dashboard?.periods || []).flatMap((period) => {
    const item = propertyMap.get(period.propertyId);
    if (!item || !period.sourceName) return [];
    const bodies = item.waterBodies.length ? item.waterBodies : [{ id: `${item.id}-pool`, name: 'Pool', type: 'SWIMMING_POOL' }];
    const usages = new Map<string, { name: string; cost: number; quantity: number }>();
    period.chemicals.forEach((chemical) => (chemical.technicians || []).forEach((usage) => {
      const current = usages.get(usage.name) || { name: usage.name, cost: 0, quantity: 0 };
      current.cost += Number(usage.cost) || 0; current.quantity += Number(usage.quantity) || 0; usages.set(usage.name, current);
    }));
    const names = [...usages.values()];
    return names.length ? names.flatMap((usage) => bodies.map((body) => ({ period, property: item, body, technician: usage.name, cost: usage.cost / bodies.length, quantity: usage.quantity / bodies.length }))) : bodies.map((body) => ({ period, property: item, body, technician: body.technicianName || 'Sin técnico', cost: period.totalCost / bodies.length, quantity: 0 }));
  }), [dashboard, propertyMap]);

  const technicians = [...new Set(rows.map((row) => row.technician).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const visible = rows.filter((row) => (!technician || row.technician === technician) && (!property || row.property.id === property) && (!bodyKind || bodyType(row.body) === bodyKind));
  const propertyRows = useMemo(() => [...visible].sort((a, b) => ((b.period.costPercent ?? -1) - (a.period.costPercent ?? -1)) || a.property.name.localeCompare(b.property.name)), [visible]);
  const alerts = new Set(propertyRows.filter((row) => row.period.monthlyFee != null && row.period.monthlyFee > 0 && row.cost / row.period.monthlyFee * 100 > 20).map((row) => row.property.id)).size;
  const bodyCount = new Set(propertyRows.map((row) => `${row.property.id}-${row.body.id}`)).size;
  const totalFee = propertyRows.reduce((sum, row) => sum + (row.period.monthlyFee || 0), 0);
  const totalCost = propertyRows.reduce((sum, row) => sum + row.cost, 0);
  const totalPercent = totalFee ? totalCost / totalFee * 100 : null;

  return <section className="reports-technician-comparison chemical-monthly-fee-alert" aria-labelledby="monthly-fee-alert-heading" aria-busy={loading}>
    <div className="reports-section-heading reports-technician-comparison-heading">
      <div><h2 id="monthly-fee-alert-heading">4. Chemical cost vs. monthly fee — &gt;20% alerts</h2><p>Month-to-month view by property, technician and standardized water body.</p></div>
      <div className="reports-technician-actions chemical-alert-actions">
        <label>Month<input aria-label="Monthly fee alert month" type="month" value={month} onChange={(event) => { setMonth(event.target.value); setTechnician(''); }} /></label>
        <label>Technician<select aria-label="Monthly fee alert technician" value={technician} onChange={(event) => setTechnician(event.target.value)}><option value="">All technicians</option>{technicians.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label>Property<select aria-label="Monthly fee alert property" value={property} onChange={(event) => setProperty(event.target.value)}><option value="">All properties</option>{(dashboard?.properties || []).slice().sort((a, b) => a.name.localeCompare(b.name)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Water body<select aria-label="Monthly fee alert water body" value={bodyKind} onChange={(event) => setBodyKind(event.target.value)}><option value="">All types</option><option value="Piscina">Piscina</option><option value="Fuente">Fuente</option><option value="Spa">Spa</option></select></label>
        <button type="button" className="chemical-alert-refresh" onClick={() => setRefresh((value) => value + 1)}><WorkspaceIcon name="refresh" />Refresh</button>
      </div>
    </div>
    {loading && <p className="reports-empty">Loading monthly fee alerts…</p>}
    {error && <p className="reports-message" role="alert">{error}</p>}
    {!loading && !error && <>
      <div className="chemical-alert-kpis"><span><small>Properties shown</small><WorkspaceIcon name="properties" /><strong>{new Set(propertyRows.map((row) => row.property.id)).size}</strong></span><span><small>Water bodies</small><WorkspaceIcon name="pool" /><strong>{bodyCount}</strong></span><span className={alerts ? 'is-alert' : ''}><small>Alerts &gt;20%</small><WorkspaceIcon name="warning" /><strong>{alerts}</strong></span><span><small>Selected chemical cost</small><WorkspaceIcon name="chemicals" /><strong>{money(totalCost)}</strong></span><span><small>Cost / monthly fee</small><WorkspaceIcon name="percent" /><strong>{pct(totalPercent)}</strong></span></div>
      {!propertyRows.length ? <p className="reports-empty">No uploaded consumption or monthly fee data is available for this month.</p> : <div className="reports-technician-table-wrap"><table className="reports-technician-table chemical-alert-table"><thead><tr><th>Property</th><th>Water body</th><th>Technician</th><th>Monthly fee</th><th>Chemical cost</th><th>% of fee</th><th>Status</th></tr></thead><tbody>{propertyRows.map((row) => { const rowPercent = row.period.monthlyFee && row.period.monthlyFee > 0 ? row.cost / row.period.monthlyFee * 100 : null; const alert = rowPercent != null && rowPercent > 20; return <tr key={`${row.property.id}-${row.body.id}-${row.technician}`} className={alert ? 'chemical-alert-row' : ''}><th>{row.property.name}</th><td>{bodyLabel(row.body)}</td><td>{row.technician}</td><td>{money(row.period.monthlyFee)}</td><td>{money(row.cost)}</td><td><strong>{pct(rowPercent)}</strong></td><td><span className={`chemical-alert-status ${alert ? 'is-alert' : 'is-normal'}`}>{alert ? 'ALERT' : 'Normal'}</span></td></tr>; })}</tbody></table></div>}
      <p className="chemical-alert-footnote">Alert threshold: chemical cost greater than 20% of the property monthly fee. Water bodies are standardized from CRM data into Pool, Fountain and Spa categories.</p>
    </>}
  </section>;
}
