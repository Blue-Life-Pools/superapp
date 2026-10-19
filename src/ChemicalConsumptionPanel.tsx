import { useEffect, useState } from 'react';
import { API_URL, apiFetch } from './api';
import type { ConsumptionFile, ConsumptionImportRow, ConsumptionChemical } from './chemicalConsumptionImport';
import { chlorineOverages, isChlorineChemical } from './chemicalConsumptionAlerts';
import './ChemicalConsumptionPanel.css';

type Property = { id: string; name: string; code: string | null; waterBodies: Array<{ id: string; name: string; gallons: number | null; type: string; size: string | null; active: boolean }> };
type Reference = { name: string; unit: string; min?: number; max?: number };
type Chemical = ConsumptionChemical & { expectedMin: number | null; expectedMax: number | null; status: string; referenceSource?: string | null; expectedQuantity?: number; historicalMean?: number; historicalMonths?: number; historicalFactor?: number; excludedMonths?: number[]; seasonal?: boolean; excessQuantity?: number | null; excessPercent?: number | null };
type Period = { propertyId: string; monthlyFee: number | null; feeSource: string | null; sourceName: string | null; chemicals: Chemical[]; references: Reference[]; seasonFactor: number; budgetPercent: number | null; budget: number | null; overBudget: boolean; totalCost: number; costPercent: number | null; allocation: { basis: string; totalGallons: number | null; unallocatedFee: number; unallocatedCost: number; bodies: Array<Property['waterBodies'][number] & { share: number; monthlyFee: number | null; chemicalCost: number; costPercent: number | null; chemicals: ConsumptionChemical[] }> } };
type Dashboard = { properties: Property[]; periods: Period[]; history?: { year: number; matchedProperties: number; unmatchedProperties: number; preliminary: boolean } };
type Preview = ConsumptionImportRow & { matchedProperty: { id: string; name: string } | null; status: string; existing: boolean };
const money = (value: number | null) => value === null ? 'Sin mensualidad' : value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const quantity = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 4 });
const percent = (value: number | null) => value === null ? '—' : `${value.toFixed(2)}%`;
const sizeLabel: Record<string, string> = { SMALL: 'Pequeña', MEDIUM: 'Mediana', LARGE: 'Grande', EXTRA_LARGE: 'Extra grande' };
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await apiFetch(`${API_URL}/chemicals/consumption${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message || 'No se pudo completar la operación.');
  return data as T;
}
const post = (data: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

export function ChemicalConsumptionPanel() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
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
    setBusy(true); setError(''); setMessage('Leyendo archivo…'); setReplace(false);
    try {
      const reader = await import('./chemicalConsumptionFiles');
      const data = kind === 'pdf' ? await reader.readConsumptionPdf(file, setMessage) : await reader.readMonthlyFees(file, month);
      const matches = await request<Preview[]>('/preview', post({ month: data.month, sourceName: data.sourceName, rows: data.rows }));
      setPending(data); setPreview(matches); setMessage('Revisa las coincidencias antes de confirmar la carga.');
    } catch (cause) { setError((cause as Error).message); setMessage(''); }
    finally { setBusy(false); }
  }
  async function importFile() {
    if (!pending) return;
    setBusy(true); setError('');
    try {
      const rows = preview.filter((row) => row.matchedProperty).map((row) => ({ propertyName: row.propertyName, code: row.code, propertyId: row.matchedProperty!.id, monthlyFee: row.monthlyFee, chemicals: row.chemicals }));
      if (!rows.length) throw new Error('Vincula al menos una propiedad.');
      const result = await request<{ imported: number; skipped: number }>('/import', post({ month: pending.month, sourceName: pending.sourceName, rows, replace }));
      setPending(null); setPreview([]); setMessage(`${result.imported} propiedades importadas; ${result.skipped} registros existentes conservados.`);
      if (month !== pending.month) setMonth(pending.month); else await load();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!propertyId) return;
    setBusy(true); setError('');
    try {
      if (!monthlyFee.trim()) throw new Error('Ingresa el total de la mensualidad de la propiedad.');
      const data = { monthlyFee: Number(monthlyFee), budgetPercent: budgetPercent === '' ? null : Number(budgetPercent), seasonFactor: Number(seasonFactor), references: period?.references || [] };
      const saved = await request<Period>(`/${propertyId}/${month}`, { ...post(data), method: 'PATCH' });
      setDashboard((current) => ({ ...current, periods: [...current.periods.filter((item) => item.propertyId !== propertyId), saved] }));
      setMessage('Mensualidad y presupuesto guardados para este mes.');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  const importedCost = dashboard.periods.reduce((sum, item) => sum + item.totalCost, 0);
  const overconsumption = chlorineOverages(dashboard.periods).map((item) => ({ ...item, propertyName: dashboard.properties.find((property) => property.id === item.propertyId)?.name || item.propertyId }));
  const overconsumptionProperties = new Set(overconsumption.map((item) => item.propertyId)).size;
  const reviewedProperties = dashboard.periods.filter((item) => item.chemicals.some((chemical) => isChlorineChemical(chemical.name) && chemical.expectedMax != null)).length;
  return <section className="consumption-panel">
    <header className="consumption-heading"><div><h2>Consumo por propiedad</h2><p>Cantidades aplicadas, costo y distribución de la mensualidad por cuerpo de agua.</p></div><label>Mes<input type="month" value={month} disabled={busy} onChange={(event) => { if (event.target.value) { setMonth(event.target.value); setPending(null); } }} /></label></header>
    <p className="consumption-muted">Para cargar mensualidades del Transaction Report de QuickBooks, selecciona primero el mes. Se toman sus invoices de mantenimiento; las reparaciones y cobros extra de químicos quedan fuera de la mensualidad.</p>
    {error && <p className="consumption-error" role="alert">{error}</p>}{message && <p className="consumption-message" role="status">{message}</p>}
    <div className="consumption-import-actions"><label className="secondary-button">{busy ? 'Procesando…' : 'Cargar PDF de Skimmer'}<input type="file" accept=".pdf" disabled={busy || loading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file, 'pdf'); event.target.value = ''; }} /></label><label className="secondary-button">Cargar mensualidades Excel<input type="file" accept=".xlsx" disabled={busy || loading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file, 'fees'); event.target.value = ''; }} /></label><button type="button" className="secondary-button" disabled={busy} onClick={() => void load()}>Actualizar</button></div>
    {pending && <section className="consumption-import-preview"><h3>Revisar carga · {pending.month}</h3><p>{pending.sourceName} · {preview.filter((row) => row.matchedProperty).length} de {preview.length} propiedades vinculadas. Las filas sin vincular quedan fuera.</p>{pending.warnings.length > 0 && <details><summary>{pending.warnings.length} avisos de revisión</summary>{pending.warnings.map((warning) => <p key={warning}>{warning}</p>)}</details>}<div className="consumption-preview-list">{preview.map((row, index) => <label key={`${row.code || row.propertyName}-${index}`}><span>{row.propertyName}{row.existing && <small>Ya tiene datos para este mes</small>}</span><select value={row.matchedProperty?.id || ''} disabled={busy} onChange={(event) => setPreview((current) => current.map((item, i) => i === index ? { ...item, matchedProperty: dashboard.properties.find((property) => property.id === event.target.value) || null } : item))}><option value="">Sin vincular</option>{dashboard.properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>)}</div><label className="consumption-replace"><input type="checkbox" checked={replace} disabled={busy} onChange={(event) => setReplace(event.target.checked)} />Reemplazar los datos existentes de este mes con los del archivo</label><div className="consumption-import-actions"><button type="button" className="primary-button" disabled={busy} onClick={() => void importFile()}>Confirmar carga</button><button type="button" className="secondary-button" disabled={busy} onClick={() => { setPending(null); setPreview([]); }}>Cancelar</button></div></section>}
    <div className="consumption-kpis"><article><span>Propiedades con consumo</span><strong>{dashboard.periods.filter((item) => item.sourceName).length}</strong></article><article><span>Costo registrado del mes</span><strong>{money(importedCost)}</strong></article><article className={overconsumptionProperties > 0 ? 'consumption-high' : ''}><span>Propiedades con sobreconsumo de cloro</span><strong>{overconsumptionProperties}</strong><small>Cloro líquido y tabletas</small></article></div>
    {!loading && <section className="consumption-overview">
      <h3>Sobreconsumo de cloro por propiedad</h3>
      <p className="consumption-muted">{overconsumptionProperties} propiedades con sobreconsumo de cloro · {reviewedProperties} propiedades con cloro evaluable. Incluye cloro líquido y tabletas.</p>
      {dashboard.history && <p className="consumption-muted">Histórico 2025: {dashboard.history.matchedProperties} propiedades vinculadas; {dashboard.history.unmatchedProperties} sin coincidencia única. La comparación de cloro usa el histórico sin atípicos, ajustado por días y estacionalidad cuando hay datos suficientes.</p>}
      {!dashboard.periods.some((item) => item.sourceName) ? <p>No hay consumo registrado para este mes. Carga el PDF de Skimmer para evaluar sobreconsumo.</p> : overconsumption.length === 0 ? <p>No se detectó sobreconsumo de cloro en las propiedades evaluables. Las propiedades sin referencia de cloro quedan sin evaluar.</p> : <div className="consumption-overage-list">{overconsumption.map(({ propertyId: id, propertyName, chemical }) => <button type="button" key={`${id}-${chemical.name}-${chemical.unit}`} onClick={() => { setPropertyId(id); setSearch(propertyName); }}>
        <strong>{propertyName}</strong><span>{chemical.name}: {quantity(chemical.quantity)} {chemical.unit} · Umbral de sobreconsumo: {quantity(chemical.expectedMax!)} {chemical.unit}</span><b>Exceso: {quantity(chemical.excessQuantity ?? chemical.quantity - chemical.expectedMax!)} {chemical.unit}{chemical.excessPercent != null ? ` (+${chemical.excessPercent.toFixed(1)}%)` : ''}</b>
      </button>)}</div>}
    </section>}
    <div className="consumption-property-select">
      <label>Propiedad
        <input
          list="consumption-properties"
          placeholder="Escribe o selecciona una propiedad"
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
    {loading && <p>Cargando consumo y perfiles…</p>}
    {selectedProperty && !loading && <>
      <h3>{selectedProperty.name}</h3><p className="consumption-muted">{selectedProperty.code} · {selectedProperty.waterBodies.filter((body) => body.active).length} cuerpos activos · {period?.sourceName || 'Sin consumo importado para este mes'}</p>
      <form className="consumption-settings" onSubmit={(event) => { event.preventDefault(); void save(); }}><label>Mensualidad total ($)<input required type="number" min="0" step="0.01" value={monthlyFee} onChange={(event) => setMonthlyFee(event.target.value)} /></label><label>Presupuesto de químicos (%)<input type="number" min="0" max="100" step="0.1" placeholder="Sin límite definido" value={budgetPercent} onChange={(event) => setBudgetPercent(event.target.value)} /></label><button className="primary-button" disabled={busy}>Guardar mensualidad</button></form>
      <p className="consumption-muted">La mensualidad se reparte por galonaje cuando todos los cuerpos tienen volumen. Si falta alguno, se usan las referencias de tamaño de Comercial y el reparto queda provisional. Cada spa tiene un máximo de $250. La comparación de cloro se calcula automáticamente con las referencias disponibles para el mes.</p>
      {period && <><div className="consumption-kpis"><article><span>Mensualidad</span><strong>{money(period.monthlyFee)}</strong></article><article><span>Costo de químicos</span><strong>{money(period.totalCost)}</strong></article><article className={period.overBudget ? 'consumption-high' : ''}><span>Mensualidad destinada a químicos</span><strong>{percent(period.costPercent)}</strong><small>{period.budget === null ? 'Sin presupuesto definido' : `Presupuesto: ${money(period.budget)}`}</small></article></div>
      <h3>Consumo de químicos de la propiedad</h3><p className="consumption-muted">Las alertas de sobreconsumo se enfocan en cloro líquido y tabletas. Los demás químicos se muestran como información de consumo. Si no hay referencia suficiente de cloro, queda sin evaluar.</p>
      <div className="consumption-history-details">{period.chemicals.filter((chemical) => isChlorineChemical(chemical.name) && chemical.referenceSource === 'HISTORY_2025').map((chemical) => <p key={`${chemical.name}-${chemical.unit}`}><strong>{chemical.name}</strong> · Media mensual limpia: {quantity(chemical.historicalMean!)} {chemical.unit} · Esperado del mes: {quantity(chemical.expectedQuantity!)} {chemical.unit} · {chemical.seasonal ? `Factor estacional: ${chemical.historicalFactor!.toFixed(2)}` : 'Sin factor estacional fiable; ajuste solo por días'} · {chemical.historicalMonths} meses registrados, {chemical.excludedMonths?.length || 0} atípicos excluidos.</p>)}</div>
        <div className="consumption-chemical-list">{period.chemicals.map((chemical) => {
          const chlorine = isChlorineChemical(chemical.name);
          const evaluated = chlorine && chemical.expectedMax != null;
          const high = evaluated && chemical.status === 'HIGH';
          return <article key={`${chemical.name}-${chemical.unit}`} className={`consumption-chemical consumption-${chlorine ? chemical.status.toLowerCase() : 'recorded'}`}>
            <div><strong>{chemical.name}</strong><span>{quantity(chemical.quantity)} {chemical.unit} · {money(chemical.cost)}</span>
              <small>{!chlorine ? 'Consumo registrado · Sin alerta de cloro' : !evaluated ? 'Cloro sin referencia suficiente para evaluar sobreconsumo' : high ? 'Sobreconsumo de cloro' : 'Sin sobreconsumo de cloro'}
                {evaluated ? ` · Umbral del mes: ${quantity(chemical.expectedMax!)} ${chemical.unit}` : ''}
              </small>
              {high && <b className="consumption-excess">Exceso: {quantity(chemical.excessQuantity ?? chemical.quantity - chemical.expectedMax!)} {chemical.unit}{chemical.excessPercent != null ? ` (+${chemical.excessPercent.toFixed(1)}%)` : ''}</b>}
            </div>
          </article>;
        })}</div>
        <h3>Distribución por cuerpo de agua</h3><p className="consumption-muted">{period.allocation.basis === 'GALLONS' ? `Basada en ${quantity(period.allocation.totalGallons!)} galones registrados.` : 'Provisional por tamaño: pequeña $600, mediana $700, grande $900, extra grande $1,300; spa $250.'} Las cantidades por cuerpo son estimadas por reparto del total registrado en Skimmer.</p>
        {(period.allocation.unallocatedFee > 0 || period.allocation.unallocatedCost > 0) && <p className="consumption-error">Pendiente de asignar: mensualidad {money(period.allocation.unallocatedFee)}, químicos {money(period.allocation.unallocatedCost)}. Revisa los cuerpos activos y el límite de los spas.</p>}
        <div className="consumption-body-list">{period.allocation.bodies.map((body) => <article key={body.id}><header><div><h4>{body.name}</h4><small>{body.type === 'SPA' ? 'Spa · máximo $250' : sizeLabel[body.size || ''] || body.type} · {body.gallons ? `${quantity(body.gallons)} gal` : 'Volumen pendiente'}</small></div><strong>{percent(body.share * 100)}</strong></header><dl><div><dt>Mensualidad asignada</dt><dd>{money(body.monthlyFee)}</dd></div><div><dt>Costo químico asignado</dt><dd>{money(body.chemicalCost)}</dd></div><div><dt>% de la mensualidad</dt><dd>{percent(body.costPercent)}</dd></div></dl><details><summary>Ver cantidades estimadas por químico</summary>{body.chemicals.map((chemical) => <p key={`${chemical.name}-${chemical.unit}`}><strong>{chemical.name}</strong><span>{quantity(chemical.quantity)} {chemical.unit} · {money(chemical.cost)}</span></p>)}</details></article>)}</div>
      </>}
      {!period && <p>Guarda la mensualidad para ver su reparto por tamaño y después carga el PDF de consumo.</p>}
    </>}
  </section>;
}
