import { useEffect, useMemo, useState } from 'react';
import { API_URL, apiFetch } from './api';
import { chemicalReportMonth } from './chemicalConsumptionAlerts';
import { companySkimmerRegisterComparison } from './companySkimmerRegisterComparison';
import type { CompanyConsumptionPeriod, CompanyRegisterReport } from './companySkimmerRegisterComparison';
import './SkimmerVsRegisterSection.css';

type ConsumptionDashboard = { periods: CompanyConsumptionPeriod[] };

const chemicalLabels: Record<string, string> = { liquidchlorine: 'Liquid Chlorine', muriaticacid: 'Muriatic Acid', tablets: 'Chlorine Tablets', stabilizer: 'Stabilizer', de: 'D.E. Powder' };
const formatQuantity = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 20 });

export function SkimmerVsRegisterSection() {
  const [month, setMonth] = useState(chemicalReportMonth);
  const [refresh, setRefresh] = useState(0);
  const [skimmer, setSkimmer] = useState<ConsumptionDashboard | null>(null);
  const [register, setRegister] = useState<CompanyRegisterReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void Promise.all([
      apiFetch(`${API_URL}/chemicals/consumption?month=${month}`, { signal: controller.signal }),
      apiFetch(`${API_URL}/chemicals/reports?month=${month}`, { signal: controller.signal }),
    ]).then(async ([skimmerResponse, registerResponse]) => {
      const [skimmerData, registerData] = await Promise.all([skimmerResponse.json(), registerResponse.json()]);
      if (!skimmerResponse.ok) throw new Error(skimmerData.message || 'Unable to load Skimmer consumption.');
      if (!registerResponse.ok) throw new Error(registerData.message || 'Unable to load technician records.');
      if (controller.signal.aborted) return;
      setSkimmer(skimmerData as ConsumptionDashboard);
      setRegister(registerData as CompanyRegisterReport[]);
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load the comparison.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [month, refresh]);

  const rows = useMemo(() => companySkimmerRegisterComparison(skimmer?.periods || [], register, month), [register, skimmer, month]);

  const maximum = Math.max(...rows.flatMap((row) => [row.skimmer, row.register]), 1);
  const hasData = rows.some((row) => row.skimmer > 0 || row.register > 0);

  return <section className="reports-chemical-comparison" aria-labelledby="skimmer-register-heading">
    <div className="reports-section-heading reports-chemical-comparison-heading">
      <div><h2 id="skimmer-register-heading">2. Total company — Skimmer vs. warehouse withdrawals</h2><p>Monthly totals: all uploaded Skimmer consumption and all warehouse withdrawals recorded in Register.</p></div>
      <div className="reports-chemical-comparison-actions"><label>Month<input aria-label="Company comparison month" lang="en" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label><button type="button" className="reports-table-download-button" onClick={() => setRefresh((value) => value + 1)}>Refresh</button></div>
    </div>
    {loading && <p className="reports-empty">Loading comparison…</p>}
    {error && <p className="reports-message" role="alert">{error}</p>}
    {!loading && !error && !hasData && <p className="reports-empty">No Skimmer consumption or technician records are available for this month.</p>}
    {!loading && !error && hasData && <>
      <div className="reports-chemical-chart" role="img" aria-label="Skimmer consumption and warehouse withdrawals by chemical">
        <div className="reports-chemical-chart-area">
          {rows.map((row) => <div className="reports-chemical-chart-group" key={row.key}>
            <div className="reports-chemical-column-pair">
              <div className="reports-chemical-column"><b>{formatQuantity(row.skimmer)}</b><i className="reports-chemical-bar-skimmer" style={{ height: `${row.skimmer ? Math.max(3, row.skimmer / maximum * 100) : 0}%` }} /></div>
              <div className="reports-chemical-column"><b>{formatQuantity(row.register)}</b><i className="reports-chemical-bar-register" style={{ height: `${row.register ? Math.max(3, row.register / maximum * 100) : 0}%` }} /></div>
            </div>
            <span>{chemicalLabels[row.key]}</span>
          </div>)}
        </div>
      </div>
      <div className="reports-chemical-legend"><span><i className="reports-chemical-swatch reports-chemical-bar-skimmer" />Skimmer</span><span><i className="reports-chemical-swatch reports-chemical-bar-register" />Warehouse</span></div>
      <div className="reports-chemical-table-wrap"><table className="reports-chemical-table"><thead><tr><th>Chemical</th><th>Skimmer</th><th>Warehouse</th><th>Difference<br />(Warehouse − Skimmer)</th></tr></thead><tbody>{rows.map((row) => <tr key={row.key}><th>{chemicalLabels[row.key]}</th><td>{formatQuantity(row.skimmer)}</td><td>{formatQuantity(row.register)}</td><td className={row.register - row.skimmer >= 0 ? 'reports-chemical-positive' : 'reports-chemical-negative'}>{row.register - row.skimmer >= 0 ? '+' : ''}{formatQuantity(row.register - row.skimmer)}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}
