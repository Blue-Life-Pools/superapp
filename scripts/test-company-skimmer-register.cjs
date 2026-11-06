const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('src/companySkimmerRegisterComparison.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
new Function('exports', 'module', 'require', source)(loaded.exports, loaded, require);
const { companySkimmerRegisterComparison } = loaded.exports;
const chemical = (name, quantity, technicians = []) => ({ name, quantity, technicians });
const period = (chemicals, extra = {}) => ({ month: '2026-10', sourceName: 'october.pdf', chemicals, ...extra });
const periods = [
  period([chemical('Liquid Chlorine', 13898.75), chemical('Muriatic Acid', 1279), chemical('Tabs', 2), chemical('DE Filter', 1.25), chemical('Estabilizador', 100)], { property: { lifecycleStatus: 'CLIENT' } }),
  period([chemical('Liquid', 212.5, [{ name: 'Camilo Hidalgo', quantity: 212.5 }]), chemical('Muriatic', 23.5), chemical('Chlorine Tablets', 3), chemical('D.E. Filter Powder', .5), chemical('Stabilizer', 25)], { property: { lifecycleStatus: 'INACTIVE' }, allocation: { bodies: [{ chemicals: [chemical('Liquid', 212.5)] }] } }),
  period([chemical('Liquid', 999)], { month: '2026-09' }),
  period([chemical('Liquid', 999)], { month: '2026-11' }),
  period([chemical('Liquid', 999)], { sourceName: null }),
];
const report = (serviceDate, technicianName, liquidChlorineGallons = 0, extra = {}) => ({ serviceDate, technicianName, liquidChlorineGallons, muriaticAcidGallons: 0, tabsQuantity: 0, dePowderBags: 0, stabilizerScoops: 0, ...extra });
const reports = [
  report('2026-10-01T00:00:00.000Z', 'Registered technician', 100, { muriaticAcidGallons: 20, tabsQuantity: 3, dePowderBags: 1, stabilizerScoops: 5 }),
  report('2026-10-31T23:59:59.999Z', 'Technician without Skimmer usage', '1.25'),
  report('2026-09-30T23:59:59.999Z', 'Registered technician', 999),
  report('2026-11-01T00:00:00.000Z', 'Registered technician', 999),
];
const snapshot = JSON.stringify({ periods, reports });
const rows = companySkimmerRegisterComparison(periods, reports, '2026-10');
const row = key => rows.find(r => r.key === key);
assert.equal(row('liquidchlorine').skimmer, 14111.25, 'Include all uploaded usage, including inactive properties and Camilo without a Register withdrawal');
assert.equal(row('liquidchlorine').register, 101.25, 'Include withdrawals even when their technician has no Skimmer usage');
assert.equal(row('muriaticacid').skimmer, 1302.5, 'Muriatic and Muriatic Acid are the same chemical');
assert.equal(row('tablets').skimmer, 5);
assert.equal(row('de').skimmer, 1.75, 'Count both DE Filter and DE Filter Powder');
assert.equal(row('stabilizer').skimmer, 125);
assert.equal(row('muriaticacid').register, 20);
assert.equal(row('tablets').register, 3);
assert.equal(row('de').register, 1);
assert.equal(row('stabilizer').register, 5);
assert.equal(JSON.stringify({ periods, reports }), snapshot, 'Do not alter the underlying consumption or withdrawal records');
const noTechnician = companySkimmerRegisterComparison([period([chemical('Liquid', 7.5)])], [], '2026-10');
assert.equal(noTechnician[0].skimmer, 7.5, 'A missing technician does not erase a property chemical total');
const exact = companySkimmerRegisterComparison([period([chemical('Liquid', '556.25'), chemical('Muriatic', '0.125')])], [], '2026-10');
assert.equal(exact[0].skimmer, 556.25);
assert.equal(exact[1].skimmer, .125);
assert.ok(companySkimmerRegisterComparison(periods, reports, '2026-12').every(r => r.skimmer === 0 && r.register === 0));
console.log('PASS: complete company totals, inactive properties, all technicians, chemical aliases, exact quantities and month boundaries');
