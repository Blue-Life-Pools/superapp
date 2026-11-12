const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(file) {
  const result = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(`src/${file}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('exports', 'module', 'require', code)(result.exports, result, name => name.startsWith('./') ? load(name.slice(2)) : require(name));
  return result.exports;
}
const { disinfectionCategory, disinfectionChemicals, disinfectionTotals, disinfectionUsageDetails } = load('disinfectionTrendData');
const chemicals = [
  { name: 'Liquid Chlorine', unit: 'GAL', quantity: 5, cost: 10, technicians: [{ name: '07 Angel Viña', quantity: 3, cost: 6 }] },
  { name: 'Cloro líquido', unit: 'gal', quantity: 3, cost: 6, technicians: [{ name: 'Angel Viña', quantity: 1, cost: 2 }, { name: '05 Georky Quiñonez', quantity: 2, cost: 4 }] },
  { name: 'Chlorine Tablets', unit: 'Qty', quantity: 4, cost: 6.8, technicians: [{ name: 'Adrian Suarez', quantity: 4, cost: 6.8 }] },
  { name: 'Stabilizer', unit: 'scoop', quantity: 2, cost: 5 },
  { name: 'Muriatic Acid', unit: 'GAL', quantity: 1, cost: 4.8, technicians: [{ name: 'Angel Viña', quantity: .5, cost: 2.4 }] },
  { name: 'Stabilizer', unit: 'LB', quantity: 1, cost: 3 },
  { name: 'Bicarbonate', unit: 'scoop', quantity: 1, cost: 1.25 },
];

const liquid = disinfectionUsageDetails(disinfectionChemicals(chemicals, 'liquid'));
assert.equal(liquid.length, 1, 'Chemical aliases with the same unit should have one total.');
assert.equal(liquid[0].quantity, 8);
assert.equal(liquid[0].cost, 16);
assert.deepEqual(liquid[0].technicians.find(person => person.name === 'Angel Viña'), { name: 'Angel Viña', quantity: 4, cost: 8 });
assert.deepEqual(liquid[0].technicians.find(person => person.name === 'Georky Quiñonez'), { name: 'Georky Quiñonez', quantity: 2, cost: 4 });
assert.deepEqual(liquid[0].technicians.find(person => person.name === 'Not recorded'), { name: 'Not recorded', quantity: 2, cost: 4 });

const balance = disinfectionUsageDetails(disinfectionChemicals(chemicals, 'balance'));
assert.equal(disinfectionCategory({ name: 'Stabilizer', unit: 'scoop' }), 'stabilizer');
assert.equal(disinfectionCategory({ name: 'D.E. Powder', unit: 'bag' }), 'other');
assert.equal(disinfectionCategory({ name: 'Cloro en polvo', unit: 'scoop' }), 'powder');
assert.equal(balance.length, 4);
assert.equal(balance.filter(product => product.name === 'Stabilizer').length, 2, 'Different measurement units must not be combined.');
assert.deepEqual(balance.find(product => product.name === 'Muriatic Acid').technicians.find(person => person.name === 'Not recorded'), { name: 'Not recorded', quantity: .5, cost: 2.4 });
assert.deepEqual(balance.find(product => product.unit === 'LB').technicians, [{ name: 'Not recorded', quantity: 1, cost: 3 }]);

const all = disinfectionUsageDetails(chemicals);
for (const product of all) {
  assert.ok(Math.abs(product.quantity - product.technicians.reduce((sum, person) => sum + person.quantity, 0)) < .00001);
  assert.ok(Math.abs(product.cost - product.technicians.reduce((sum, person) => sum + person.cost, 0)) < .00001);
}
const totals = disinfectionTotals(chemicals);
assert.ok(Math.abs(totals.total - all.reduce((sum, product) => sum + product.cost, 0)) < .00001);
assert.equal(disinfectionUsageDetails([]).length, 0);
console.log('PASS: monthly chemical grouping, exact quantities and costs by technician, refill attribution, separate units, and explicitly unrecorded usage.');
