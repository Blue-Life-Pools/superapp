import type { Dashboard } from './ChemicalConsumptionPanel';
import { chlorineOverages, englishChemicalName, isChlorineChemical } from './chemicalConsumptionAlerts';

const quantity = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 4 });
const money = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export function ChemicalOverconsumptionReport({ dashboard, month, propertyId, onSelectProperty }: { dashboard: Dashboard; month: string; propertyId?: string; onSelectProperty?: (id: string) => void }) {
  const alerts = chlorineOverages(dashboard.periods).filter((alert) => !propertyId || alert.propertyId === propertyId);
  const period = dashboard.periods.find((item) => item.propertyId === propertyId);
  const evaluated = dashboard.periods.filter((item) => (!propertyId || item.propertyId === propertyId) && item.chemicals.some((chemical) => isChlorineChemical(chemical.name) && chemical.expectedMax != null)).length;
  const name = (id: string) => dashboard.properties.find((item) => item.id === id)?.name || 'Property';
  return <section className="history-panel history-chemical-report">
    <div className="history-panel-heading"><div><h2>Chemical overconsumption</h2><p className="history-muted">{month} · Chlorine alerts (liquid and tablets), based on each property's monthly reference.</p></div><span className="history-notification history-notification-chemicals" aria-label={`${new Set(alerts.map((item) => item.propertyId)).size} properties with chlorine overconsumption`}>{new Set(alerts.map((item) => item.propertyId)).size}</span></div>
    <p>{alerts.length} chlorine overconsumption alerts · {evaluated} properties with an evaluable chlorine reference.</p>
    {!propertyId && (alerts.length ? <div className="history-chemical-table-wrap"><table className="history-chemical-table"><thead><tr><th>Property</th><th>Chemical</th><th>Recorded</th><th>Monthly threshold</th><th>Excess</th></tr></thead><tbody>{alerts.map(({ propertyId: id, chemical }) => <tr key={`${id}-${chemical.name}-${chemical.unit}`}><td><button className="history-text-button" onClick={() => onSelectProperty?.(id)}>{name(id)} →</button></td><td>{englishChemicalName(chemical.name)}</td><td>{quantity(chemical.quantity)} {chemical.unit}</td><td>{quantity(chemical.expectedMax!)} {chemical.unit}</td><td>{quantity(chemical.excessQuantity ?? chemical.quantity - chemical.expectedMax!)} {chemical.unit}{chemical.excessPercent != null ? ` (+${chemical.excessPercent.toFixed(1)}%)` : ''}</td></tr>)}</tbody></table></div> : <p className="history-muted">No chlorine overconsumption detected in the evaluable records for this month. Missing references are not considered normal consumption.</p>)}
    {propertyId && (period?.sourceName ? <><p className="history-muted">Source: {period.sourceName}. Other chemicals are shown for information; alerts focus on chlorine.</p><div className="history-chemical-table-wrap"><table className="history-chemical-table"><thead><tr><th>Chemical</th><th>Recorded</th><th>Cost</th><th>Expected this month</th><th>Chlorine threshold</th><th>Status</th></tr></thead><tbody>{period.chemicals.map((chemical) => {
      const chlorine = isChlorineChemical(chemical.name);
      const evaluable = chlorine && chemical.expectedMax != null;
      const high = evaluable && chemical.status === 'HIGH';
      return <tr key={`${chemical.name}-${chemical.unit}`} className={high ? 'history-chemical-overage' : ''}><td>{high && <span className="history-chemical-dot" aria-label="Chlorine overconsumption" />}{englishChemicalName(chemical.name)}</td><td>{quantity(chemical.quantity)} {chemical.unit}</td><td>{money(chemical.cost)}</td><td>{chlorine && chemical.expectedQuantity != null ? `${quantity(chemical.expectedQuantity)} ${chemical.unit}` : '—'}</td><td>{evaluable ? `${quantity(chemical.expectedMax!)} ${chemical.unit}` : '—'}</td><td>{!chlorine ? 'Recorded' : !evaluable ? 'No reference' : high ? `Overconsumption: +${quantity(chemical.excessQuantity ?? chemical.quantity - chemical.expectedMax!)} ${chemical.unit}` : 'No overconsumption'}</td></tr>;
    })}</tbody></table></div></> : <p className="history-muted">No consumption report for this property in {month}. Choose another month or import consumption in Chemicals.</p>)}
  </section>;
}
