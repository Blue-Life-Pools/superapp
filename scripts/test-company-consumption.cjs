const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file) {
  const code = ts.transpileModule(fs.readFileSync(`src/${file}`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const result = { exports: {} };
  new Function('exports', 'module', 'require', code)(result.exports, result, (name) => name.startsWith('./') ? load(name.slice(2) + '.ts') : require(name));
  return result.exports;
}
const { companyChartScale, companyChemicalStatus, companyReportPeriodOptions, companyReportMonthLabel } = load('chemicalCompanyReport.ts');
const { CompanyConsumptionChart } = load('CompanyConsumptionChart.tsx');
const thresholds = { warning: 80, attention: 90, maximum: 100 };
const chemical = { id: 'liquidchlorine:gal', name: 'Liquid Chlorine', unit: 'gal', recordedQuantity: 120, maximum: 100, comparableQuantity: 120, comparisonMaximum: 100, percent: 120, excessQuantity: 20, remainingQuantity: 0, referenceProperties: 1, reportedReferenceProperties: 1, coverageComplete: true, unreferencedProperties: 0, unreferencedQuantity: 0, georkyRefillQuantity: 30, properties: [{ propertyId: 'a', propertyName: 'Example Pool', recordedQuantity: 120, maximum: 100 }] };

for (const [value, level] of [[0, 'normal'], [79.9, 'normal'], [80, 'warning'], [90, 'attention'], [100, 'attention'], [100.1, 'high']]) {
  assert.equal(companyChemicalStatus({ ...chemical, percent: value }, thresholds).level, level);
}
assert.equal(companyChemicalStatus({ ...chemical, percent: 20, coverageComplete: false }, thresholds).label, 'Partial coverage');
assert.equal(companyChemicalStatus({ ...chemical, recordedQuantity: null }, thresholds).label, 'No Skimmer data');
assert.equal(companyChemicalStatus({ ...chemical, percent: null, maximum: null }, thresholds).label, 'No comparable reference');
assert.equal(companyChartScale([chemical]), 200);
assert.equal(companyChartScale([{ ...chemical, percent: 345 }]), 350);
assert.deepEqual(companyReportPeriodOptions(['2026-01', '2025-12', '2026-01', '2026-13'], '2026-02'), ['2026-02', '2026-01', '2025-12']);
assert.deepEqual(companyReportPeriodOptions(['2026-01', '2025-12'], 'global'), ['2026-01', '2025-12']);
assert.equal(companyReportMonthLabel('2026-01'), 'January 2026');

const html = renderToStaticMarkup(React.createElement(CompanyConsumptionChart, { report: { month: '2026-01', baselineYear: 2025, thresholds, chemicals: [chemical] } }));
assert.match(html, /Skimmer vs. estimated maximum/);
assert.match(html, /width:60%/);
assert.match(html, /left:40%/);
assert.match(html, /left:45%/);
assert.match(html, /left:50%/);
assert.match(html, /120% of comparable maximum/);
assert.match(html, /Exceeds comparable maximum by 20 gal/);
assert.match(html, /Georky tank refill: 30 gal/);
assert.match(html, /Example Pool/);
assert.match(html, /<th>Skimmer \(gal\)<\/th>/);
const missing = renderToStaticMarkup(React.createElement(CompanyConsumptionChart, { report: { month: '2026-01', baselineYear: 2025, thresholds, chemicals: [{ ...chemical, recordedQuantity: null, percent: null }] } }));
assert.match(missing, /No data for this month/);
assert.doesNotMatch(missing, /class="company-chart-fill"/);
const global = renderToStaticMarkup(React.createElement(CompanyConsumptionChart, { report: { month: 'global', scope: 'global', months: ['2026-01', '2026-02'], baselineYear: 2025, thresholds, chemicals: [{ ...chemical, maximum: 200, comparisonMaximum: 100, referencePropertyMonths: 2, reportedReferencePropertyMonths: 1, coverageComplete: false, properties: [{ ...chemical.properties[0], maximum: 200, comparableQuantity: 120, comparisonMaximum: 100, referenceMonths: 2, reportedMonths: 1 }] }] } }));
assert.match(global, /estimated maximum · Global/);
assert.match(global, /Reported property-months: 1\/2/);
assert.match(global, /Reported \/ reference months/);
assert.match(global, /<td>20<\/td>/, 'Global property excess uses only months that have an uploaded report');
assert.doesNotMatch(global, /Invalid Date/);
console.log('PASS: company chart thresholds, partial data, shared scale, markers, refills, units and property breakdown');
