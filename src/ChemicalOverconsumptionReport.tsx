import type { Dashboard } from './ChemicalConsumptionPanel';
import { chlorineOverages, englishChemicalName, isChlorineChemical } from './chemicalConsumptionAlerts';

const quantity = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 4 });
const money = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export function ChemicalOverconsumptionReport({ dashboard, month, propertyId }: { dashboard: Dashboard; month: string; propertyId: string }) {
  if (!propertyId) return null;
  const alerts = chlorineOverages(dashboard.periods).filter((alert) => alert.propertyId === propertyId);
  const allMonths = month === 'all';
  const periodLabel = allMonths ? 'All months' : month;
  const periods = dashboard.periods.filter((item) => item.propertyId === propertyId && item.sourceName).slice().sort((a, b) => (b.month || month).localeCompare(a.month || month));
  const evaluated = periods.some((item) => item.chemicals.some((chemical) => isChlorineChemical(chemical.name) && chemical.expectedMax != null)) ? 1 : 0;
  return <section className="history-panel history-chemical-report">
    <div className="history-panel-heading"><div><h2>Chemicals</h2><p className="history-muted">{periodLabel} · Chlorine alerts (liquid and tablets), based on this property's monthly reference.</p></div><span className="history-notification history-notification-chemicals" aria-label={`${alerts.length} chlorine overconsumption alerts`}>{alerts.length}</span></div>
    <p>{alerts.length} chlorine overconsumption alerts · {evaluated} properties with an evaluable chlorine reference.</p>
    {periods.length ? periods.map((period) => <div className="history-chemical-period" key={`${propertyId}-${period.month || month}`}>
      {allMonths && <h3>{period.month}</h3>}
      <p className="history-muted">Source: {period.sourceName}. Other chemicals are shown for information; alerts focus on chlorine.</p><div className="history-chemical-table-wrap"><table className="history-chemical-table"><thead><tr><th>Chemical</th><th>Recorded</th><th>Cost</th><th>Expected this month</th><th>Chlorine threshold</th><th>Status</th></tr></thead><tbody>{period.chemicals.map((chemical) => {
      const chlorine = isChlorineChemical(chemical.name);
      const evaluable = chlorine && chemical.expectedMax != null;
      const high = evaluable && chemical.status === 'HIGH';
      return <tr key={`${chemical.name}-${chemical.unit}`} className={high ? 'history-chemical-overage' : ''}><td>{high && <span className="history-chemical-dot" aria-label="Chlorine overconsumption" />}{englishChemicalName(chemical.name)}</td><td>{quantity(chemical.quantity)} {chemical.unit}</td><td>{money(chemical.cost)}</td><td>{chlorine && chemical.expectedQuantity != null ? `${quantity(chemical.expectedQuantity)} ${chemical.unit}` : '—'}</td><td>{evaluable ? `${quantity(chemical.expectedMax!)} ${chemical.unit}` : '—'}</td><td>{!chlorine ? 'Recorded' : !evaluable ? 'No reference' : high ? `Overconsumption: +${quantity(chemical.excessQuantity ?? chemical.quantity - chemical.expectedMax!)} ${chemical.unit}` : 'No overconsumption'}</td></tr>;
    })}</tbody></table></div></div>) : <p className="history-muted">No consumption report for this property {allMonths ? 'in any month' : `in ${month}`}. Choose another month or import consumption in Chemicals.</p>}
  </section>;
}
