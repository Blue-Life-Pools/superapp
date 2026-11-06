import { useEffect, useMemo, useState } from 'react';
import { API_URL, apiFetch } from './api';
import { chemicalReportMonth } from './chemicalConsumptionAlerts';
import { technicianChemicalComparison } from './chemicalTechnicianComparison';
import type { ChemicalKey, ConsumptionPeriod, TechnicianReport, TechnicianRow } from './chemicalTechnicianComparison';
import './TechnicianChemicalComparisonSection.css';

type ConsumptionDashboard = { periods: ConsumptionPeriod[] };

const columns: Array<{ key: ChemicalKey; label: string }> = [
  { key: 'liquidchlorine', label: 'Cloro líquido' },
  { key: 'muriaticacid', label: 'Ácido' },
  { key: 'tablets', label: 'Tabletas / Pastillas' },
  { key: 'de', label: 'DE' },
];

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
      apiFetch(`${API_URL}/chemicals/reports?month=${month}`, { signal: controller.signal }),
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

  const rows = useMemo(() => technicianChemicalComparison(consumption?.periods || [], reports), [consumption, reports]);

  const difference = (values: TechnicianRow['values'][ChemicalKey]) => values.register - values.skimmer;
  const format = (value: number) => value === 0 ? '0.0' : `${value > 0 ? '+' : ''}${value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 20 })}`;

  return <section className="reports-technician-comparison" aria-labelledby="technician-comparison-heading">
    <div className="reports-section-heading reports-technician-comparison-heading"><div><h2 id="technician-comparison-heading">3. Por técnico — Diferencia Skimmer vs. Bodega por químico</h2><p>Cada casilla muestra la diferencia (Bodega − Skimmer) y debajo cuál de los dos registros fue mayor.</p></div><div className="reports-technician-actions"><label>Mes<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label><button type="button" className="reports-table-download-button" onClick={() => setRefresh((value) => value + 1)}>Actualizar</button></div></div>
    {loading && <p className="reports-empty">Cargando comparación por técnico…</p>}
    {error && <p className="reports-message" role="alert">{error}</p>}
    {!loading && !error && !rows.length && <p className="reports-empty">No hay detalle por técnico para este mes.</p>}
    {!loading && !error && rows.length > 0 && <div className="reports-technician-table-wrap">
      <table className="reports-technician-table">
        <thead><tr><th>Técnico</th>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.key}><th>{row.name}</th>{columns.map((column) => {
          const values = row.values[column.key];
          const delta = difference(values);
          const total = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 20 });
          return <td key={column.key} className={delta > 0 ? 'reports-technician-positive' : delta < 0 ? 'reports-technician-negative' : ''}>
            <strong>{format(delta)}</strong>
            <small>{delta > 0 ? 'Bodega' : delta < 0 ? 'Skimmer' : '—'}</small>
            <small className="reports-technician-totals">Bodega: {total(values.register)} · Skimmer: {total(values.skimmer)}</small>
          </td>;
        })}</tr>)}</tbody>
      </table>
      <p className="reports-technician-footnote">Bodega suma todos los registros de Register del mes seleccionado. Skimmer suma el consumo cargado en Property consumption de ese mismo mes. Diferencia = Bodega − Skimmer. Positivo (azul) indica mayor salida de bodega; negativo (gris) indica mayor consumo registrado en Skimmer.</p>
    </div>}
  </section>;
}
