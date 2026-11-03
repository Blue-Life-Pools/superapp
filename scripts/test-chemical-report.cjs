const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(file) {
  const code = ts.transpileModule(fs.readFileSync(`src/${file}`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const result = { exports: {} };
  new Function('exports', 'module', 'require', code)(result.exports, result, (name) => name.startsWith('./') ? load(name.slice(2) + '.ts') : require(name));
  return result.exports;
}
const { ChemicalOverconsumptionReport } = load('ChemicalOverconsumptionReport.tsx');
const chlorine = { name: 'Liquid', unit: 'gal', quantity: 30, cost: 60, status: 'HIGH', expectedMax: 20, expectedQuantity: 15, excessQuantity: 10, excessPercent: 50 };
const acid = { ...chlorine, name: 'Muriatic Acid' };
const dashboard = { properties: [{ id: 'a', name: 'Sample Property' }], periods: [{ propertyId: 'a', sourceName: 'sample.pdf', chemicals: [chlorine, acid] }] };
const summary = renderToStaticMarkup(React.createElement(ChemicalOverconsumptionReport, { dashboard, month: '2026-09' }));
assert.equal(summary, '', 'Do not render a global chemicals report without a selected property');
const details = renderToStaticMarkup(React.createElement(ChemicalOverconsumptionReport, { dashboard, month: '2026-09', propertyId: 'a' }));
assert.match(details, /<h2>Chemicals<\/h2>/);
assert.match(details, /2026-09/);
assert.match(details, /<th>Chemical<\/th><th>Recorded<\/th><th>Cost<\/th><th>Expected this month<\/th><th>Chlorine threshold<\/th><th>Status<\/th>/);
assert.match(details, /Liquid Chlorine/);
assert.match(details, /Muriatic Acid/);
assert.match(details, /Overconsumption: \+10 gal/);
assert.match(details, /<td>Recorded<\/td>/);
const missing = renderToStaticMarkup(React.createElement(ChemicalOverconsumptionReport, { dashboard, month: '2026-10', propertyId: 'missing' }));
assert.match(missing, /No consumption report for this property in 2026-10/);
const monthlyDashboard = { properties: dashboard.properties, periods: [
  { ...dashboard.periods[0], month: '2026-09' },
  { ...dashboard.periods[0], month: '2026-10', sourceName: 'october.pdf', chemicals: [{ ...chlorine, quantity: 12, cost: 24, expectedMax: 15, status: 'IN_RANGE' }] },
] };
const allMonths = renderToStaticMarkup(React.createElement(ChemicalOverconsumptionReport, { dashboard: monthlyDashboard, month: 'all', propertyId: 'a' }));
assert.match(allMonths, /All months/);
assert.match(allMonths, /<h3>2026-10<\/h3>/);
assert.match(allMonths, /<h3>2026-09<\/h3>/);
assert.equal((allMonths.match(/<table /g) || []).length, 2, 'Each month has its own quantities and reference');
assert.match(allMonths, /1 properties with an evaluable chlorine reference/);
assert.match(allMonths, /No overconsumption/);
assert.match(allMonths, /Overconsumption: \+10 gal/);
assert.ok(allMonths.indexOf('2026-10') < allMonths.indexOf('2026-09'), 'Newest month is shown first');
console.log('PASS: property-only Chemicals panel, unchanged table columns, chemical details and missing-report state');
