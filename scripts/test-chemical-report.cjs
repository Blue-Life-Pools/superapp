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
assert.match(summary, /2026-09/);
assert.match(summary, /1 chlorine overconsumption alerts/);
assert.match(summary, /Sample Property/);
assert.match(summary, /Liquid Chlorine/);
assert.doesNotMatch(summary, /Muriatic Acid/);
const details = renderToStaticMarkup(React.createElement(ChemicalOverconsumptionReport, { dashboard, month: '2026-09', propertyId: 'a' }));
assert.match(details, /Muriatic Acid/);
assert.match(details, /Overconsumption: \+10 gal/);
assert.match(details, /<td>Recorded<\/td>/);
const missing = renderToStaticMarkup(React.createElement(ChemicalOverconsumptionReport, { dashboard, month: '2026-10', propertyId: 'missing' }));
assert.match(missing, /No consumption report for this property in 2026-10/);
console.log('PASS: monthly report, chlorine-only alert summary, detailed chemical information and missing-report state');
