import { useEffect, useMemo, useState } from 'react';
import { API_URL, apiFetch } from './api';
import { chemicalReportMonth } from './chemicalConsumptionAlerts';
import { technicianChemicalComparison } from './chemicalTechnicianComparison';
import type { ChemicalKey, ConsumptionPeriod, TechnicianReport, TechnicianRow } from './chemicalTechnicianComparison';
import './TechnicianChemicalComparisonSection.css';

type ConsumptionDashboard = { periods: ConsumptionPeriod[] };

const columns: Array<{ key: ChemicalKey; label: string }> = [
  { key: 'liquidchlorine', label: 'Liquid Chlorine' },
  { key: 'muriaticacid', label: 'Muriatic Acid' },
  { key: 'tablets', label: 'Chlorine Tablets' },
  { key: 'de', label: 'DE' },
];

export function TechnicianChemicalComparisonSection() {
  const [month, setMonth] = useState(chemicalReportMonth);
  const [technician, setTechnician] = useState('');
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
      if (!consumptionResponse.ok) throw new Error(consumptionData.message || 'Unable to load Skimmer consumption.');
      if (!reportsResponse.ok) throw new Error(reportsData.message || 'Unable to load Register records.');
      if (controller.signal.aborted) return;
      setConsumption(consumptionData as ConsumptionDashboard);
      setReports((reportsData as TechnicianReport[]).filter((item) => item.serviceDate.slice(0, 7) === month));
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load the technician comparison.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [month, refresh]);

  const rows = useMemo(() => technicianChemicalComparison(consumption?.periods || [], reports), [consumption, reports]);
  const technicianOptions = [...rows].sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const selectedTechnician = rows.find((row) => row.key === technician);
  const visibleRows = selectedTechnician ? [selectedTechnician] : rows;

  const difference = (values: TechnicianRow['values'][ChemicalKey]) => values.register - values.skimmer;
  const format = (value: number) => Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 20 });

  return <section className="reports-technician-comparison" aria-labelledby="technician-comparison-heading">
    <div className="reports-section-heading reports-technician-comparison-heading">
      <div><h2 id="technician-comparison-heading">3. By technician — Skimmer vs. warehouse difference by chemical</h2><p>Each cell shows the absolute difference, with both source totals below.</p></div>
      <div className="reports-technician-actions">
        <label>Month<input aria-label="Technician comparison month" lang="en" type="month" value={month} onChange={(event) => { setMonth(event.target.value); setTechnician(''); }} /></label>
        <label>Technician<select aria-label="Comparison technician" value={selectedTechnician?.key || ''} disabled={loading || !rows.length} onChange={(event) => setTechnician(event.target.value)}>
          <option value="">All technicians</option>
          {technicianOptions.map((row) => <option key={row.key} value={row.key}>{row.name}</option>)}
        </select></label>
        <button type="button" className="reports-table-download-button" onClick={() => setRefresh((value) => value + 1)}>Refresh</button>
      </div>
    </div>
    {loading && <p className="reports-empty">Loading technician comparison…</p>}
    {error && <p className="reports-message" role="alert">{error}</p>}
    {!loading && !error && !rows.length && <p className="reports-empty">No technician details are available for this month.</p>}
    {!loading && !error && rows.length > 0 && <div className="reports-technician-table-wrap">
      <table className="reports-technician-table">
        <thead><tr><th>Technician</th>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
        <tbody>{visibleRows.map((row) => <tr key={row.key}><th>{row.name}</th>{columns.map((column) => {
          const values = row.values[column.key];
          const delta = difference(values);
          const total = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 20 });
          return <td key={column.key} className={delta > 0 ? 'reports-technician-positive' : delta < 0 ? 'reports-technician-negative' : ''}>
            <strong>{format(delta)}</strong>
            <small className="reports-technician-totals">Warehouse: {total(values.register)} · Skimmer: {total(values.skimmer)}</small>
          </td>;
        })}</tr>)}</tbody>
      </table>
      <p className="reports-technician-footnote">Warehouse includes all Register withdrawals for the selected month. Skimmer includes uploaded consumption for the same month. Differences are absolute values. Blue indicates higher warehouse withdrawals; gray indicates higher Skimmer consumption.</p>
    </div>}
  </section>;
}
