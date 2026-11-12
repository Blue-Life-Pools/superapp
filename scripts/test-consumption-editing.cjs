const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const result = { exports: {} };
const code = ts.transpileModule(fs.readFileSync('src/consumptionEditing.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
new Function('exports', 'module', code)(result.exports, result);
const { changeChemicalCost, chemicalEditError, editableChemicals } = result.exports;
const chemical = { name: 'Liquid Chlorine', unit: 'GAL', quantity: 5, cost: 10, technicians: [{ name: 'Alex', quantity: 1, cost: 2 }, { name: 'Alex', quantity: 1, cost: 2 }, { name: 'Georky', quantity: 2, cost: 4 }] };
const edited = changeChemicalCost(chemical, 3.33);
assert.equal(edited.technicians.length, 3);
assert.deepEqual(edited.technicians.map(entry => entry.quantity), [1, 1, 2]);
assert.ok(Math.abs(edited.technicians.reduce((sum, entry) => sum + entry.cost, 0) - 2.66) < .001);
assert.equal(chemical.cost, 10);
assert.equal(chemical.technicians[0].cost, 2);
assert.equal(chemicalEditError([edited]), '');
assert.equal(chemicalEditError([changeChemicalCost(chemical, 0)]), '');
assert.match(chemicalEditError([{ ...chemical, quantity: 1 }]), /quantities exceed/);
assert.match(chemicalEditError([{ ...chemical, cost: 1 }]), /costs exceed/);
assert.match(chemicalEditError([chemical, { ...chemical, name: ' liquid chlorine ' }]), /duplicate/);
assert.match(chemicalEditError([{ ...chemical, quantity: NaN }]), /zero or greater/);
const draft = editableChemicals([chemical]);
draft[0].technicians[0].name = 'Other';
assert.equal(chemical.technicians[0].name, 'Alex');
for (let cents = 0; cents < 1000; cents++) {
  const item = changeChemicalCost({ ...chemical, cost: 8 }, cents / 100);
  assert.ok(Math.abs(item.technicians.reduce((sum, entry) => sum + entry.cost, 0) - cents / 100) < .00001);
}
console.log('PASS: technician usage occurrences and quantities preserved, rounded costs reconciled including unassigned shares, isolated drafts and invalid attribution rejected.');
