import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chemicalReportMonth, chlorineOverages, englishChemicalName, isChlorineChemical } from '../src/chemicalConsumptionAlerts.ts';

const high = (name, excessPercent = 10) => ({ name, status: 'HIGH', expectedMax: 20, excessPercent });
test('Home and Chemicals use the Colombia month at the UTC month boundary', () => {
  assert.equal(chemicalReportMonth(new Date('2026-10-01T02:00:00Z')), '2026-09');
  assert.equal(chemicalReportMonth(new Date('2026-10-01T06:00:00Z')), '2026-10');
});
test('translates chemical display names without modifying the underlying records', () => {
  assert.equal(englishChemicalName('Estabilizador'), 'Stabilizer');
  assert.equal(englishChemicalName('Liquid'), 'Liquid Chlorine');
  assert.equal(englishChemicalName('Unknown product'), 'Unknown product');
});
test('recognizes recorded liquid chlorine and tablets, excluding acid and unspecified shock', () => {
  for (const name of ['Liquid', 'Liquid Chlorine', 'Cloro líquido', 'Tabs', 'Chlorine tablets']) assert.equal(isChlorineChemical(name), true);
  for (const name of ['Muriatic Acid', 'Bicarbonate', 'SALT', 'Shock', 'Phosphates']) assert.equal(isChlorineChemical(name), false);
});
test('acid alone does not produce a chlorine overconsumption alert', () => {
  assert.deepEqual(chlorineOverages([{ propertyId: 'a', chemicals: [high('Muriatic Acid', 500)] }]), []);
});
test('sorts chlorine excesses and counts a property once even with two chlorine products', () => {
  const alerts = chlorineOverages([
    { propertyId: 'a', chemicals: [high('Liquid', 20), high('Tabs', 30), high('Muriatic Acid', 900)] },
    { propertyId: 'b', chemicals: [high('Liquid Chlorine', 50)] },
  ]);
  assert.deepEqual(alerts.map((item) => item.chemical.excessPercent), [50, 30, 20]);
  assert.equal(new Set(alerts.map((item) => item.propertyId)).size, 2);
});
test('does not count chlorine without a threshold or below the threshold', () => {
  const alerts = chlorineOverages([{ propertyId: 'a', chemicals: [
    { name: 'Liquid', status: 'NO_REFERENCE', expectedMax: null },
    { name: 'Tabs', status: 'HIGH', expectedMax: null },
    { name: 'Liquid Chlorine', status: 'IN_RANGE', expectedMax: 20 },
  ] }]);
  assert.equal(alerts.length, 0);
});
