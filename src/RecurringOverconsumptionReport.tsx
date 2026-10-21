import { useState } from 'react';
import type { Dashboard } from './ChemicalConsumptionPanel';
import { englishChemicalName } from './chemicalConsumptionAlerts';

const quantity = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 4 });

export function RecurringOverconsumptionReport({ items }: { items: NonNullable<Dashboard['recurringOverconsumption']> }) {
  const [selectedId, setSelectedId] = useState('');
  const selected = items.find((item) => item.propertyId === selectedId);

  if (!items.length) return null;

  return <section className="consumption-panel consumption-recurring" aria-labelledby="recurring-overconsumption-heading">
    <h2 id="recurring-overconsumption-heading">Properties with overconsumption for more than one month</h2>
    <div className="consumption-recurring-list">
      {items.map((item) => <button
        type="button"
        key={item.propertyId}
        className={item.propertyId === selectedId ? 'active' : ''}
        aria-expanded={item.propertyId === selectedId}
        aria-controls={item.propertyId === selectedId ? 'recurring-overconsumption-details' : undefined}
        onClick={() => setSelectedId((current) => current === item.propertyId ? '' : item.propertyId)}
      >
        <strong>{item.propertyName}</strong><span>{item.months} months in alert</span>
      </button>)}
    </div>
    {selected && <div className="consumption-recurring-details" id="recurring-overconsumption-details">
      <strong>{selected.propertyName}</strong>
      {selected.entries.map((entry) => <p key={`${entry.month}-${entry.chemicalName}-${entry.unit}`}>
        <b>{entry.month}</b> · {englishChemicalName(entry.chemicalName)}: {quantity(entry.quantity)} {entry.unit} · threshold {quantity(entry.threshold)} {entry.unit} · +{entry.excessPercent.toFixed(1)}%
      </p>)}
    </div>}
  </section>;
}
