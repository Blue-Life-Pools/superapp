import { useEffect, useMemo, useState } from 'react';
import { API_URL, apiFetch } from './api';
import { chemicalReportMonth } from './chemicalConsumptionAlerts';
import './TechnicianChemicalComparisonSection.css';

type TechnicianUsage = { name: string; quantity: number };
type ConsumptionChemical = { name: string; quantity: number | string; technicians?: TechnicianUsage[] };
type ConsumptionPeriod = { chemicals: ConsumptionChemical[] };
type ConsumptionDashboard = { periods: ConsumptionPeriod[] };
type TechnicianReport = { serviceDate: string; technicianName: string; tabsQuantity: number | string; liquidChlorineGallons: number | string; muriaticAcidGallons: number | string; dePowderBags: number | string };
type ChemicalKey = 'liquidchlorine' | 'muriaticacid' | 'tablets' | 'de';
type TechnicianRow = { name: string; tokens: string[]; values: Record<ChemicalKey, { skimmer: number; register: number }> };

const columns: Array<{ key: ChemicalKey; label: string }> = [
  { key: 'liquidchlorine', label: 'Cloro líquido' },
  { key: 'muriaticacid', label: 'Ácido' },
  { key: 'tablets', label: 'Tabletas / Pastillas' },
  { key: 'de', label: 'DE' },
];
const numeric = (value: number | string | null | undefined) => Number(value) || 0;
const nameTokens = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\([^)]*\)/g, '').replace(/^[0-9]+\s*/, '').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean).sort();
const normalized = (value: string) => nameTokens(value).join('');
const displayName = (value: string) => value.trim().replace(/\s*\([^)]*\)/g, '').replace(/^[0-9]+\s*[-.]?\s*/, '').replace(/\s+/g, ' ');
const chemicalKey = (value: string): ChemicalKey | null => {
  const key = normalized(value);
  if (key.includes('liquidchlorine') || key === 'liquid' || key.includes('cloroliquido')) return 'liquidchlorine';
  if (key.includes('muriaticacid') || key.includes('acidomuriatico')) return 'muriaticacid';
  if (key.includes('tablet') || key === 'tabs' || key.includes('clorotablet')) return 'tablets';
  if (key.includes('depowder') || key === 'de' || key.includes('filterpowder')) return 'de';
  return null;
};
const emptyValues = (): TechnicianRow['values'] => ({ liquidchlorine: { skimmer: 0, register: 0 }, muriaticacid: { skimmer: 0, register: 0 }, tablets: { skimmer: 0, register: 0 }, de: { skimmer: 0, register: 0 } });

export function TechnicianChemicalComparisonSection() {
  const [month, setMonth] = useState(chemicalReportMonth);
  const [refresh, setRefresh] = useState(0);
  const [consumption, setConsumption] = useState<ConsumptionDashboard | null>(null);
  const [reports, setReports] = useState<TechnicianReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void Promise.all([
      apiFetch(`${API_URL}/chemicals/consumption?month=${month}`, { signal: controller.signal }),
      apiFetch(`${API_URL}/chemicals/reports`, { signal: controller.signal }),
    ]).then(async ([consumptionResponse, reportsResponse]) => {
      const [consumptionData, reportsData] = await Promise.all([consumptionResponse.json(), reportsResponse.json()]);
      if (!consumptionResponse.ok) throw new Error(consumptionData.message || 'No fue posible cargar Skimmer.');
      if (!reportsResponse.ok) throw new Error(reportsData.message || 'No fue posible cargar Register.');
      if (controller.signal.aborted) return;
      setConsumption(consumptionData as ConsumptionDashboard);
      setReports((reportsData as TechnicianReport[]).filter((item) => item.serviceDate.slice(0, 7) === month));
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No fue posible cargar la comparación por técnico.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [month, refresh]);

  const rows = useMemo(() => {
    const byTechnician = new Map<string, TechnicianRow>();
    const getRow = (rawName: string) => {
      const tokens = nameTokens(rawName);
      const key = tokens.join('');
      if (!key) return null;
      const exact = byTechnician.get(key);
      if (exact) return exact;
      const subsetMatches = [...new Set([...byTechnician.values()])].filter((candidate) => {
        const candidateTokens = new Set(candidate.tokens);
        const incomingTokens = new Set(tokens);
        const incomingIsShort = [...incomingTokens].every((token) => candidateTokens.has(token));
        const candidateIsShort = [...candidateTokens].every((token) => incomingTokens.has(token));
        return incomingIsShort || candidateIsShort;
      });
      const existing = subsetMatches.length === 1 ? subsetMatches[0] : null;
      if (existing) {
        if (tokens.length > existing.tokens.length) {
          existing.name = displayName(rawName);
          existing.tokens = tokens;
        }
        byTechnician.set(key, existing);
        return existing;
      }
      const row = { name: displayName(rawName), tokens, values: emptyValues() };
      byTechnician.set(key, row);
      return row;
    };
    for (const period of consumption?.periods || []) {
      for (const chemical of period.chemicals || []) {
        const key = chemicalKey(chemical.name);
        if (!key) continue;
        for (const usage of chemical.technicians || []) {
          const row = getRow(usage.name);
          if (row) row.values[key].skimmer += numeric(usage.quantity);
        }
      }
    }
    for (const report of reports) {
      const row = getRow(report.technicianName);
      if (!row) continue;
      row.values.liquidchlorine.register += numeric(report.liquidChlorineGallons);
      row.values.muriaticacid.register += numeric(report.muriaticAcidGallons);
      row.values.tablets.register += numeric(report.tabsQuantity);
      row.values.de.register += numeric(report.dePowderBags);
    }
    return [...new Set(byTechnician.values())].filter((row) => columns.some(({ key }) => row.values[key].skimmer || row.values[key].register)).sort((a, b) => columns.reduce((sum, column) => sum + b.values[column.key].register - b.values[column.key].skimmer - (a.values[column.key].register - a.values[column.key].skimmer), 0));
  }, [consumption, reports]);

  const difference = (values: TechnicianRow['values'][ChemicalKey]) => values.register - values.skimmer;
  const format = (value: number) => value === 0 ? '0.0' : `${value > 0 ? '+' : ''}${value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;

  return <section className="reports-technician-comparison" aria-labelledby="technician-comparison-heading">
    <div className="reports-section-heading reports-technician-comparison-heading"><div><h2 id="technician-comparison-heading">3. Por técnico — Diferencia Skimmer vs. Bodega por químico</h2><p>Cada casilla muestra la diferencia (Bodega − Skimmer) y debajo cuál de los dos registros fue mayor.</p></div><div className="reports-technician-actions"><label>Mes<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label><button type="button" className="reports-table-download-button" onClick={() => setRefresh((value) => value + 1)}>Actualizar</button></div></div>
    {loading && <p className="reports-empty">Cargando comparación por técnico…</p>}
    {error && <p className="reports-message" role="alert">{error}</p>}
    {!loading && !error && !rows.length && <p className="reports-empty">No hay detalle por técnico para este mes.</p>}
    {!loading && !error && rows.length > 0 && <div className="reports-technician-table-wrap"><table className="reports-technician-table"><thead><tr><th>Técnico</th>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={normalized(row.name)}><th>{row.name}</th>{columns.map((column) => { const values = row.values[column.key]; const delta = difference(values); return <td key={column.key} className={delta > 0 ? 'reports-technician-positive' : delta < 0 ? 'reports-technician-negative' : ''}><strong>{format(delta)}</strong><small>{delta > 0 ? 'Bodega' : delta < 0 ? 'Skimmer' : '—'}</small></td>; })}</tr>)}</tbody></table><p className="reports-technician-footnote">Diferencia = Bodega − Skimmer. Positivo (azul) indica mayor salida de bodega; negativo (gris) indica mayor consumo registrado en Skimmer. La tabla está ordenada de mayor tendencia hacia Bodega a mayor tendencia hacia Skimmer.</p></div>}
  </section>;
}
