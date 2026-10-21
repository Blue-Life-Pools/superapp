import { useEffect, useState } from 'react';
import { API_URL, apiFetch } from './api';
import { chemicalReportMonth } from './chemicalConsumptionAlerts';
import { CompanyConsumptionChart } from './CompanyConsumptionChart';
import { companyReportMonthLabel, companyReportPeriodOptions, type CompanyConsumptionReport } from './chemicalCompanyReport';
import './ChemicalConsumptionPanel.css';
import './ChemicalsReportsPanel.css';

export function ChemicalsReportsPanel() {
  const [month, setMonth] = useState(chemicalReportMonth);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{ month: string; refresh: number; data?: CompanyConsumptionReport; error?: string } | null>(null);
  const current = result?.month === month && result.refresh === refresh ? result : null;

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await apiFetch(`${API_URL}/chemicals/consumption/company-report?month=${month}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message || 'Unable to load the company report.');
        if (!controller.signal.aborted) setResult({ month, refresh, data });
      } catch (cause) {
        if (!controller.signal.aborted) setResult({ month, refresh, error: cause instanceof Error ? cause.message : 'Unable to load the company report.' });
      }
    })();
    return () => controller.abort();
  }, [month, refresh]);

  const report = current?.data;
  const global = month === 'global';
  const months = companyReportPeriodOptions(result?.data?.availableMonths || [], month);
  return <section className="consumption-panel chemicals-reports-panel" aria-labelledby="chemicals-reports-heading" aria-busy={!current}>
    <header className="consumption-heading"><div><h2 id="chemicals-reports-heading">Reports</h2><p>Company chemical consumption compared with monthly estimates from 2025.</p></div><label>Period<select value={month} onChange={(event) => setMonth(event.target.value)}><option value="global">Global — All uploaded months</option>{months.map((value) => <option key={value} value={value}>{companyReportMonthLabel(value)}</option>)}</select></label></header>
    <div className="company-report-toolbar"><button type="button" className="secondary-button" onClick={() => setRefresh((value) => value + 1)}>Refresh reports</button>{report && <span>{report.uploadedProperties} active properties with uploaded Skimmer data · {report.matchedHistoryProperties} properties matched to 2025 history</span>}</div>
    {!current && <p role="status">Loading company chemical report…</p>}
    {current?.error && <p className="consumption-error" role="alert">{current.error}</p>}
    {report && <>
      {global && <div className="company-report-period-summary"><strong>Global · {report.months.length} uploaded months</strong><p>Consumption and estimated maximums are added month by month. Months without uploaded Skimmer reports are excluded.</p>{!!report.months.length && <details><summary>Included months</summary><p>{report.months.map(companyReportMonthLabel).join(' · ')}</p></details>}</div>}
      {!report.uploadedProperties && <p className="consumption-message">{global ? 'No uploaded Skimmer reports are available for the global view.' : `No Skimmer report has been uploaded for ${companyReportMonthLabel(month)}. The maximums below come from 2025 history.`} Upload a PDF in Property consumption to compare actual usage.</p>}
      <CompanyConsumptionChart report={report} />
      {!!report.sources.length && <details className="company-report-sources"><summary>Uploaded sources ({report.sources.length})</summary>{report.sources.map((source) => <p key={source}>{source}</p>)}</details>}
    </>}
  </section>;
}
