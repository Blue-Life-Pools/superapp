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
const { companyChemicalMetrics, companyChemicalStatus, companyReportPeriodOptions, companyReportMonthLabel } = load('chemicalCompanyReport.ts');
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
assert.deepEqual(companyReportPeriodOptions(['2026-01', '2025-12', '2026-01', '2026-13'], '2026-02'), ['2026-02', '2026-01', '2025-12']);
assert.deepEqual(companyReportPeriodOptions(['2026-01', '2025-12'], 'global'), ['2026-01', '2025-12']);
assert.equal(companyReportMonthLabel('2026-01'), 'January 2026');

const html = renderToStaticMarkup(React.createElement(CompanyConsumptionChart, { report: { month: '2026-01', baselineYear: 2025, thresholds, chemicals: [chemical] } }));
assert.match(html, /Skimmer vs. estimated maximum/);
assert.match(html, /width:100%/);
assert.match(html, /left:80%/);
assert.match(html, /left:90%/);
assert.match(html, /left:100%/);
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
const fixedScale = renderToStaticMarkup(React.createElement(CompanyConsumptionChart, { report: { month: '2026-01', baselineYear: 2025, thresholds, chemicals: [acid, extreme] } }));
assert.match(fixedScale, /class="company-chart-fill" style="width:100%"><span>106\.5%<\/span>/, 'Overconsumption fills the whole track while retaining its real percentage');
assert.match(fixedScale, /class="company-chart-fill" style="width:100%"><span>10,000%<\/span>/);
assert.match(fixedScale, /100% of maximum/);
const liquid = { ...chemical, id: 'liquid', recordedQuantity: 15600, maximum: 22311.34, georkyRefillQuantity: 0, properties: [] };
const septemberAcid = { ...chemical, id: 'acid', name: 'Muriatic Acid', recordedQuantity: 1112.5, maximum: 997.91, georkyRefillQuantity: 0, properties: [] };
for (const scope of ['month', 'global']) {
  const fill = renderToStaticMarkup(React.createElement(CompanyConsumptionChart, { report: { month: scope === 'global' ? 'global' : '2026-09', scope, baselineYear: 2025, thresholds, chemicals: [liquid, septemberAcid, extreme] } }));
  const firstBarWidth = Number(fill.match(/class="company-chart-fill" style="width:([\d.]+)%"/)?.[1]);
  assert.ok(Math.abs(firstBarWidth - 69.9) < .05, 'The liquid chlorine bar fills about 69.9% regardless of other chemical extremes');
  assert.match(fill, /<span>69\.9%<\/span>/);
  assert.match(fill, /class="company-chart-row company-chart-high"[^]*?class="company-chart-fill" style="width:100%"><span>111\.5%<\/span>/, 'The acid track is fully red above its maximum');
}
for (const invalid of [null, 0, -1, NaN, Infinity]) assert.equal(companyChemicalMetrics({ ...chemical, maximum: invalid }).percent, null);
const grown = { ...manualChemical, id: 'stabilizer:scoop', name: 'Stabilizer', recordedQuantity: 430, baseMaximum: 412, maximum: 412 * 275 / 253, updatedMaximum: 412 * 275 / 253, populationAdjusted: true, adjustmentFactor: 275 / 253, manualMonthlyMaximum: 412 };
assert.equal(companyChemicalStatus(grown, thresholds).level, 'attention', 'Alerts use the updated cap, not the exceeded original cap');
for (const scope of ['month', 'global']) {
  const grownHtml = renderToStaticMarkup(React.createElement(CompanyConsumptionChart, { report: { month: scope === 'global' ? 'global' : '2026-01', scope, baselineYear: 2025, thresholds, basePropertyCount: 253, uploadedProperties: 275, monthlyPropertyCounts: [{ month: '2026-01', properties: 275 }], chemicals: [grown] } }));
  assert.match(grownHtml, /Updated maximum: <strong>447\.83 scoop/);
  assert.match(grownHtml, /Base maximum: 412 scoop/);
  assert.match(grownHtml, /96% of company maximum/);
  assert.match(grownHtml, /company-chart-row company-chart-attention/);
  assert.match(grownHtml, /<td>275<\/td><td>253<\/td>/);
  assert.match(grownHtml, /unique properties with uploaded Skimmer data/);
}
const awaitingUpload = renderToStaticMarkup(React.createElement(CompanyConsumptionChart, { report: { month: '2026-01', baselineYear: 2025, thresholds, uploadedProperties: 0, chemicals: [{ ...grown, maximum: null, updatedMaximum: null, recordedQuantity: null }] } }));
assert.match(awaitingUpload, /Awaiting Skimmer report/);
assert.doesNotMatch(awaitingUpload, /class="company-chart-fill"/);
const supplied = { ...chemical, maximumSource: 'WORKBOOK_PROPERTY', maximum: 100, populationAdjusted: false, baseMaximum: 100 };
const suppliedHtml = renderToStaticMarkup(React.createElement(CompanyConsumptionChart, { report: { month: '2026-09', scope: 'month', baselineYear: 2025, thresholds, basePropertyCount: 253, maximumReferenceSources: ['property-maximums.xlsx'], uploadedProperties: 275, chemicals: [supplied] } }));
assert.match(suppliedHtml, /Updated maximum: <strong>100 gal/);
assert.match(suppliedHtml, /company-chart-row company-chart-high/);
assert.match(suppliedHtml, /cleaned monthly maximum/);
assert.match(suppliedHtml, /property-maximums.xlsx/);
assert.match(suppliedHtml, /<th>Maximum \(gal\)<\/th>/);
assert.doesNotMatch(suppliedHtml, /<th>Base maximum|Manual base monthly company maximums|mean plus 3 standard deviations/);
console.log('PASS: company chart thresholds, partial data, shared scale, markers, refills, units and property breakdown');
