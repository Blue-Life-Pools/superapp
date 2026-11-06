const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file) {
  const code = ts.transpileModule(fs.readFileSync(`src/${file}`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const result = { exports: {} };
  new Function('exports', 'module', 'require', code)(result.exports, result, (name) => name.startsWith('./') ? load(name.slice(2) + '.ts') : require(name));
  return result.exports;
}
const { technicianChemicalComparison } = load('chemicalTechnicianComparison.ts');
const { cleanChemicalTechnicianName, chemicalTechnicianResolver } = load('chemicalTechnicianIdentity.ts');
const { pdfTextLines, parseSkimmerDosages } = load('chemicalConsumptionImport.ts');
const usage = (name, quantity) => ({ name, quantity });
const periods = [{ chemicals: [
  { name: 'Liquid', quantity: 4335, technicians: [usage('Georky', 4335)] },
  { name: 'Liquid Chlorine', quantity: 867.5, technicians: [usage('Nelson Belauzaran', 817.5), usage('Miguel 1. main Morales', 50)] },
  { name: 'Liquid', quantity: 65, technicians: [usage('Jose Lugo Chlorine', 30), usage('Angel Viña Chlorine', 35)] },
  { name: 'Tabs', quantity: 78, technicians: [usage('Georky Quinones', 2), usage('Nelson Belauzaran', 76)] },
  { name: 'Muriatic', quantity: 5.25, technicians: [usage('Jose Lugo Acid', 5.25)] },
  { name: 'DE Filter', quantity: .5, technicians: [usage('Angel Viña Powder', .5)] },
] }];
const register = (technicianName, liquidChlorineGallons, tabsQuantity = 0) => ({ serviceDate: '2026-10-10', technicianName, liquidChlorineGallons, tabsQuantity, muriaticAcidGallons: 0, dePowderBags: 0 });
const reports = [register('05 Georky Quiñonez', 4770), register('06 Nelson Belaunzaran', 393, 100), register('13 Miguel Morales', 0), register('17 Jose Lugo', 100), register('01 Angel Viña', 104)];
const result = technicianChemicalComparison(periods, reports);
assert.equal(result.length, 5);
const row = (name) => result.find((r) => r.name === name);
assert.equal(row('Georky Quiñonez').values.liquidchlorine.register - row('Georky Quiñonez').values.liquidchlorine.skimmer, 435);
assert.equal(row('Georky Quiñonez').values.tablets.skimmer, 2);
assert.equal(row('Nelson Belaunzaran').values.liquidchlorine.register - row('Nelson Belaunzaran').values.liquidchlorine.skimmer, -424.5);
assert.equal(row('Nelson Belaunzaran').values.tablets.register - row('Nelson Belaunzaran').values.tablets.skimmer, 24);
assert.equal(row('Jose Lugo').values.muriaticacid.skimmer, 5.25);
assert.equal(row('Angel Viña').values.de.skimmer, .5);
assert.equal(result.reduce((sum, r) => sum + r.values.liquidchlorine.skimmer, 0), 5267.5, 'All aliases retain their quantities exactly once');
const reversed = periods.map((p) => ({ chemicals: [...p.chemicals].reverse().map((c) => ({ ...c, technicians: [...c.technicians].reverse() })) }));
assert.deepEqual(technicianChemicalComparison(reversed, [...reports].reverse()), result, 'Grouping does not depend on import order');
assert.equal(cleanChemicalTechnicianName('Miguel 1. main Morales'), 'Miguel Morales');
assert.equal(cleanChemicalTechnicianName('Jose Lugo FRONT Included'), 'Jose Lugo');
const resolve = chemicalTechnicianResolver(['Angel', 'Angel Viña', 'Angel Hernandez', 'Camilo', 'Camilo Leon', 'Camilo Hidalgo', 'Miguel Morales', 'Miguel Noria', 'Nelson Belaunzaran', 'Nelson Suarez Farias']);
assert.equal(resolve('Angel').name, 'Angel', 'Ambiguous first names must not be assigned to a namesake');
assert.notEqual(resolve('Camilo Leon').key, resolve('Camilo Hidalgo').key);
assert.notEqual(resolve('Miguel Morales').key, resolve('Miguel Noria').key);
assert.notEqual(resolve('Nelson Belaunzaran').key, resolve('Nelson Suarez Farias').key);
const extended = chemicalTechnicianResolver(['Joisel', 'Joisel Sagion', '16 Joisel Sagion Díaz']);
assert.equal(extended('Joisel').name, 'Joisel Sagion Díaz');
assert.equal(extended('Joisel Sagion').key, extended('Joisel Sagion Díaz').key);

const item = (str, x, y) => ({ str, transform: [1, 0, 0, 1, x, y] });
const headers = [item('Tech', 125, 550), item('Body of', 198, 557), item('Chemical', 267, 550), item('Dosage', 480, 550), item('Cost', 614, 550), item('Price', 652, 550)];
const detailItems = (name, body, chemical, qty, cost, y) => [item('10/2/2026', 52, y), item(name, 125, y), item(body, 198, y), item(chemical, 267, y), item(qty, 510, y), item('GAL', 530, y), item(`($${cost})`, 604, y), item('$0.00', 652, y)];
const lines = pdfTextLines([...headers, ...detailItems('Miguel', '1. main', 'Liquid', '2½', '4.53', 500), item('Morales', 125, 485), item('Pool', 198, 485), item('Chlorine', 267, 485), ...detailItems('Jose Lugo', 'Pool', 'Liquid', '5', '9.05', 450), item('Chlorine', 267, 435)]);
assert.ok(lines.includes('10/2/2026\tMiguel Morales\t1. main Pool\tLiquid Chlorine\t2½ GAL\t($4.53)\t$0.00'));
const secondHeaders = [item('Tech', 145, 300), item('Body of Water', 230, 300), item('Chemical', 320, 300), item('Dosage', 480, 300), item('Cost', 614, 300), item('Price', 652, 300)];
const secondTable = pdfTextLines([...headers, ...detailItems('Miguel', 'Pool', 'Tabs', '1', '1.00', 500), item('Morales', 125, 485), ...secondHeaders, item('10/3/2026', 52, 260), item('Nelson', 145, 260), item('Pool', 230, 260), item('Tabs', 320, 260), item('1 Qty', 510, 260), item('($1.00)', 604, 260), item('$0.00', 652, 260), item('Belauzaran', 145, 245)]);
assert.ok(secondTable.includes('10/3/2026\tNelson Belauzaran\tPool\tTabs\t1 Qty\t($1.00)\t$0.00'), 'Each table on the page uses its own column positions');
const parsed = parseSkimmerDosages(['10/1/2026 - 10/31/2026', 'Example (ABC12345)', ...lines, 'Liquid Chlorine 7½ GAL ($13.58) $0.00', 'Grand Total for Example ($13.58)'], 'example.pdf');
assert.deepEqual(parsed.rows[0].chemicals[0].technicians, [{ name: 'Miguel Morales', quantity: 2.5, cost: 4.53 }, { name: 'Jose Lugo', quantity: 5, cost: 9.05 }]);
// A returning technician must update their own usage, not the last technician added.
const repeated = parseSkimmerDosages(['10/1/2026 - 10/31/2026', 'Example (ABC12345)', '10/2/2026 Miguel Pool Tabs 1 Qty ($1.00) $0.00', 'Morales', '10/3/2026 Jose Lugo Pool Tabs 1 Qty ($1.00) $0.00', '10/4/2026 Miguel Pool Tabs 1 Qty ($1.00) $0.00', 'Morales', 'Tabs 3 Qty ($3.00) $0.00', 'Grand Total for Example ($3.00)'], 'example.pdf');
assert.deepEqual(repeated.rows[0].chemicals[0].technicians, [{ name: 'Miguel Morales', quantity: 2, cost: 2 }, { name: 'Jose Lugo', quantity: 1, cost: 1 }]);
console.log('PASS: technician aliases, combined balances, order independence, ambiguous names, wrapped PDF columns and repeated technicians');
