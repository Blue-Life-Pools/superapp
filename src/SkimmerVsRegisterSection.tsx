import { useEffect, useMemo, useState } from 'react';
import { API_URL, apiFetch } from './api';
import { chemicalReportMonth } from './chemicalConsumptionAlerts';
import './SkimmerVsRegisterSection.css';

type CompanyChemical = { name: string; recordedQuantity: number | null };
type CompanyReport = { chemicals: CompanyChemical[] };
type TechnicianReport = {
  serviceDate: string;
  tabsQuantity: number | string;
  liquidChlorineGallons: number | string;
  muriaticAcidGallons: number | string;
  dePowderBags: number | string;
  stabilizerScoops: number | string;
};

type ComparisonRow = {
  key: string;
  label: string;
  skimmer: number;
  register: number;
};

const chemicals = [
  { key: 'liquidchlorine', label: 'Cloro líquido' },
  { key: 'muriaticacid', label: 'Ácido' },
  { key: 'tablets', label: 'Tabletas / Pastillas' },
  { key: 'stabilizer', label: 'Estabilizador' },
  { key: 'de', label: 'DE' },
] as const;

const numberValue = (value: number | string | null | undefined) => Number(value) || 0;
const chemicalKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function skimmerKey(name: string) {
  const key = chemicalKey(name);
  if (key.includes('liquidchlorine') || key === 'liquid' || key.includes('cloroliquido')) return 'liquidchlorine';
  if (key.includes('muriaticacid') || key.includes('acidomuriatico')) return 'muriaticacid';
  if (key.includes('tablet') || key === 'tabs' || key.includes('clorotablet')) return 'tablets';
  if (key.includes('stabil')) return 'stabilizer';
  if (key.includes('depowder') || key === 'de' || key.includes('filterpowder')) return 'de';
  return null;
}

function registerValues(report: TechnicianReport) {
  return {
    liquidchlorine: numberValue(report.liquidChlorineGallons),
    muriaticacid: numberValue(report.muriaticAcidGallons),
    tablets: numberValue(report.tabsQuantity),
    stabilizer: numberValue(report.stabilizerScoops),
    de: numberValue(report.dePowderBags),
  };
}

const formatQuantity = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function SkimmerVsRegisterSection() {
  const [month, setMonth] = useState(chemicalReportMonth);
  const [refresh, setRefresh] = useState(0);
  const [skimmer, setSkimmer] = useState<CompanyReport | null>(null);
  const [register, setRegister] = useState<TechnicianReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void Promise.all([
      apiFetch(`${API_URL}/chemicals/consumption/company-report?month=${month}`, { signal: controller.signal }),
      apiFetch(`${API_URL}/chemicals/reports`, { signal: controller.signal }),
    ]).then(async ([skimmerResponse, registerResponse]) => {
      const [skimmerData, registerData] = await Promise.all([skimmerResponse.json(), registerResponse.json()]);
      if (!skimmerResponse.ok) throw new Error(skimmerData.message || 'No fue posible cargar Skimmer.');
      if (!registerResponse.ok) throw new Error(registerData.message || 'No fue posible cargar los registros de técnicos.');
      if (controller.signal.aborted) return;
      setSkimmer(skimmerData as CompanyReport);
      setRegister((registerData as TechnicianReport[]).filter((item) => item.serviceDate.slice(0, 7) === month));
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No fue posible cargar la comparación.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [month, refresh]);

  const rows = useMemo<ComparisonRow[]>(() => {
    const skimmerTotals = new Map<string, number>();
    for (const item of skimmer?.chemicals || []) {
      const key = skimmerKey(item.name);
      if (key) skimmerTotals.set(key, (skimmerTotals.get(key) || 0) + numberValue(item.recordedQuantity));
    }
    const registerTotals = register.reduce<Record<string, number>>((totals, item) => {
      const values = registerValues(item);
      for (const chemical of chemicals) totals[chemical.key] = (totals[chemical.key] || 0) + values[chemical.key];
      return totals;
    }, {});
    return chemicals.map((chemical) => ({
      ...chemical,
      skimmer: skimmerTotals.get(chemical.key) || 0,
      register: registerTotals[chemical.key] || 0,
    }));
  }, [register, skimmer]);

  const maximum = Math.max(...rows.flatMap((row) => [row.skimmer, row.register]), 1);
  const hasData = rows.some((row) => row.skimmer > 0 || row.register > 0);

  return <section className="reports-chemical-comparison" aria-labelledby="skimmer-register-heading">
    <div className="reports-section-heading reports-chemical-comparison-heading">
      <div><h2 id="skimmer-register-heading">2. Total empresa — Skimmer vs. salidas de bodega</h2><p>Comparativo del consumo cargado desde Skimmer frente a lo registrado por los técnicos en Register.</p></div>
      <div className="reports-chemical-comparison-actions"><label>Mes<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label><button type="button" className="reports-table-download-button" onClick={() => setRefresh((value) => value + 1)}>Actualizar</button></div>
    </div>
    {loading && <p className="reports-empty">Cargando comparación…</p>}
    {error && <p className="reports-message" role="alert">{error}</p>}
    {!loading && !error && !hasData && <p className="reports-empty">No hay datos de Skimmer ni registros de técnicos para este mes.</p>}
    {!loading && !error && hasData && <>
      <div className="reports-chemical-chart" role="img" aria-label="Comparación de Skimmer y salidas de bodega por químico">
        {rows.map((row) => <div className="reports-chemical-chart-row" key={row.key}>
          <span>{row.label}</span><div className="reports-chemical-bars"><i className="reports-chemical-bar-skimmer" style={{ width: `${row.skimmer / maximum * 100}%` }}><b>{formatQuantity(row.skimmer)}</b></i><i className="reports-chemical-bar-register" style={{ width: `${row.register / maximum * 100}%` }}><b>{formatQuantity(row.register)}</b></i></div>
        </div>)}
      </div>
      <div className="reports-chemical-legend"><span><i className="reports-chemical-swatch reports-chemical-bar-skimmer" />Skimmer</span><span><i className="reports-chemical-swatch reports-chemical-bar-register" />Bodega</span></div>
      <div className="reports-chemical-table-wrap"><table className="reports-chemical-table"><thead><tr><th>Químico</th><th>Skimmer</th><th>Bodega</th><th>Diferencia<br />(Bodega − Skimmer)</th></tr></thead><tbody>{rows.map((row) => <tr key={row.key}><th>{row.label}</th><td>{formatQuantity(row.skimmer)}</td><td>{formatQuantity(row.register)}</td><td className={row.register - row.skimmer >= 0 ? 'reports-chemical-positive' : 'reports-chemical-negative'}>{row.register - row.skimmer >= 0 ? '+' : ''}{formatQuantity(row.register - row.skimmer)}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}
