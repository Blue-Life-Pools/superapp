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
const { companyChartScale, companyChemicalMetrics, companyChemicalStatus, companyReportPeriodOptions, companyReportMonthLabel } = load('chemicalCompanyReport.ts');
const { CompanyConsumptionChart } = load('CompanyConsumptionChart.tsx');
const thresholds = { warning: 80, attention: 90, maximum: 100 };
const chemical = { id: 'liquidchlorine:gal', name: 'Liquid Chlorine', unit: 'gal', recordedQuantity: 120, maximum: 100, comparableQuantity: 120, comparisonMaximum: 100, percent: 120, excessQuantity: 20, remainingQuantity: 0, referenceProperties: 1, reportedReferenceProperties: 1, coverageComplete: true, unreferencedProperties: 0, unreferencedQuantity: 0, georkyRefillQuantity: 30, properties: [{ propertyId: 'a', propertyName: 'Example Pool', recordedQuantity: 120, maximum: 100 }] };

for (const [value, level] of [[0, 'normal'], [79.9, 'normal'], [80, 'warning'], [90, 'attention'], [100, 'attention'], [100.1, 'high']]) {
  for (const coverageComplete of [true, false]) {
    assert.equal(companyChemicalStatus({ ...chemical, recordedQuantity: value, maximum: 100, percent: 1, coverageComplete }, thresholds).level, level);
  }
}
assert.equal(companyChemicalStatus({ ...chemical, recordedQuantity: 20, maximum: 100, percent: 120, coverageComplete: false }, thresholds).label, 'Within range');
assert.equal(companyChemicalStatus({ ...chemical, recordedQuantity: null }, thresholds).label, 'No Skimmer data');
assert.equal(companyChemicalStatus({ ...chemical, percent: null, maximum: null }, thresholds).label, 'No maximum available');
assert.equal(companyChartScale([chemical]), 200);
assert.equal(companyChartScale([{ ...chemical, recordedQuantity: 345, maximum: 100, percent: 0 }]), 350);
assert.deepEqual(companyReportPeriodOptions(['2026-01', '2025-12', '2026-01', '2026-13'], '2026-02'), ['2026-02', '2026-01', '2025-12']);
assert.deepEqual(companyReportPeriodOptions(['2026-01', '2025-12'], 'global'), ['2026-01', '2025-12']);
assert.equal(companyReportMonthLabel('2026-01'), 'January 2026');

const html = renderToStaticMarkup(React.createElement(CompanyConsumptionChart, { report: { month: '2026-01', baselineYear: 2025, thresholds, chemicals: [chemical] } }));
assert.match(html, /Skimmer vs. estimated maximum/);
assert.match(html, /width:60%/);
assert.match(html, /left:40%/);
assert.match(html, /left:45%/);
assert.match(html, /left:50%/);
assert.match(html, /120% of company maximum/);
assert.match(html, /class="company-chart-fill"[^>]*><span>120%<\/span>/);
assert.match(html, /class="company-legend-normal"[^>]*>&lt; 80%/);
assert.match(html, /class="company-legend-high"[^>]*>&gt; 100%/);
assert.doesNotMatch(html, /class="company-chart-row-summary"|class="company-chart-incomplete"|class="company-chart-note"/);
assert.doesNotMatch(html, /Monthly maximum =|Company totals include all uploaded usage|The dashed line marks|below the comparable maximum|Reference:|Exceeds comparable maximum by/);
assert.match(html, /Georky tank refill: 30 gal/);
assert.match(html, /Example Pool/);
assert.match(html, /<th>Skimmer \(gal\)<\/th>/);
const missing = renderToStaticMarkup(React.createElement(CompanyConsumptionChart, { report: { month: '2026-01', baselineYear: 2025, thresholds, chemicals: [{ ...chemical, recordedQuantity: null, percent: null }] } }));
assert.match(missing, /No data for this month/);
assert.doesNotMatch(missing, /class="company-chart-fill"/);
const global = renderToStaticMarkup(React.createElement(CompanyConsumptionChart, { report: { month: 'global', scope: 'global', months: ['2026-01', '2026-02'], baselineYear: 2025, thresholds, chemicals: [{ ...chemical, recordedQuantity: 240, maximum: 200, comparisonMaximum: 100, referencePropertyMonths: 2, reportedReferencePropertyMonths: 1, coverageComplete: false, properties: [{ ...chemical.properties[0], recordedQuantity: 240, maximum: 200, comparableQuantity: 120, comparisonMaximum: 100, referenceMonths: 2, reportedMonths: 1 }] }] } }));
assert.match(global, /estimated maximum · Global/);
assert.doesNotMatch(global, /Reported property-months:|Partial coverage: usage without a reference/);
assert.match(global, /Reported \/ reference months/);
assert.match(global, /<td>40<\/td>/, 'Global property excess uses the same maximum that is displayed in its row');
assert.doesNotMatch(global, /Invalid Date/);
const manualChemical = { ...chemical, id: 'bicarbonate:scoop', name: 'Bicarbonate', unit: 'scoop', maximumSource: 'MANUAL_COMPANY', manualMonthlyMaximum: 170, recordedQuantity: 200, maximum: 170, comparableQuantity: 200, comparisonMaximum: 170, percent: 200 / 170 * 100, coverageComplete: false, georkyRefillQuantity: 0, properties: [{ propertyId: 'a', propertyName: 'Example Pool', recordedQuantity: 200, maximum: null }] };
assert.equal(companyChemicalStatus(manualChemical, thresholds).label, 'Overconsumption');
const manual = renderToStaticMarkup(React.createElement(CompanyConsumptionChart, { report: { month: '2026-01', baselineYear: 2025, thresholds, chemicals: [manualChemical] } }));
assert.match(manual, /170 scoop \(manual\)/);
assert.match(manual, /117\.6% of company maximum/);
assert.match(manual, /<th>Skimmer \(scoop\)<\/th>/);
assert.doesNotMatch(manual, /<th>Maximum|<th>Excess|Compared:/, 'A company manual limit must not become a per-property allowance');
const acid = { ...chemical, name: 'Muriatic Acid', recordedQuantity: 685.25, maximum: 643.6674910612855, comparableQuantity: 445.5, comparisonMaximum: 599.3778879406699, percent: 74.3, coverageComplete: false };
assert.equal(companyChemicalMetrics(acid).percent.toFixed(1), '106.5');
assert.equal(companyChemicalStatus(acid, thresholds).level, 'high');
const acidHtml = renderToStaticMarkup(React.createElement(CompanyConsumptionChart, { report: { month: '2026-01', baselineYear: 2025, thresholds, chemicals: [acid] } }));
assert.match(acidHtml, /company-chart-row company-chart-high/);
assert.match(acidHtml, /106\.5% of company maximum/);
assert.doesNotMatch(acidHtml, /74\.3%|Compared:/);
const extreme = { ...chemical, recordedQuantity: 10000, maximum: 100 };
const wideScale = renderToStaticMarkup(React.createElement(CompanyConsumptionChart, { report: { month: '2026-01', baselineYear: 2025, thresholds, chemicals: [acid, extreme] } }));
assert.match(wideScale, /class="company-chart-value">106\.5%<\/span>/, 'The percentage stays visible when another chemical expands the common scale');
for (const invalid of [null, 0, -1, NaN, Infinity]) assert.equal(companyChemicalMetrics({ ...chemical, maximum: invalid }).percent, null);
console.log('PASS: company chart thresholds, partial data, shared scale, markers, refills, units and property breakdown');
