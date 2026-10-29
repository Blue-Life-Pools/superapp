const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { test } = require('node:test');
const code = ts.transpileModule(fs.readFileSync('src/qualityInspectionFilters.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
new Function('exports', 'module', code)(loaded.exports, loaded);
const { filterQualityInspections, qualityDateBasis } = loaded.exports;
const defaults = { property: 'ALL', technician: 'ALL', status: 'ALL', severity: 'ALL', estimate: 'ALL', dashboard: 'ALL', dateBasis: 'AUTO', dateMode: 'ALL', day: '', from: '', to: '' };
const finding = (id, extra = {}) => ({ id, status: 'RESOLVED', severity: 'MEDIUM', requiresEstimate: false, resolvedAt: '2026-10-28T16:00:00Z', ...extra });
const visits = [
  { id: 'visit-12', propertyId: 'canopy', technicianName: 'Camilo', visitDate: '2026-10-12T19:49:00Z', findings: [finding('closed-28'), finding('closed-16', { resolvedAt: '2026-10-16T16:00:00Z', severity: 'HIGH', requiresEstimate: true }), finding('open', { status: 'OPEN', resolvedAt: null })] },
  { id: 'visit-28', propertyId: 'park', technicianName: 'Diego', visitDate: '2026-10-28T16:00:00Z', findings: [finding('bogota-28', { resolvedAt: '2026-10-29T03:59:00Z', severity: 'HIGH', requiresEstimate: true }), finding('bogota-29', { resolvedAt: '2026-10-29T05:00:00Z' }), finding('missing-date', { resolvedAt: null }), finding('invalid-date', { resolvedAt: 'invalid' })] },
];
const run = (extra = {}, items = visits) => filterQualityInspections(items, { ...defaults, ...extra });
const ids = items => items.flatMap(visit => visit.findings.map(f => f.id));

test('Solved uses the recorded resolution date even when the inspection took place weeks earlier', () => {
  assert.equal(qualityDateBasis({ ...defaults, dashboard: 'SOLVED' }), 'RESOLVED');
  const result = run({ dashboard: 'SOLVED', dateMode: 'DAY', day: '2026-10-28' });
  assert.deepEqual(ids(result), ['closed-28', 'bogota-28']);
  assert.equal(result.flatMap(visit => visit.findings).filter(f => f.status === 'RESOLVED').length, 2);
  assert.equal(visits[0].findings.length, 3, 'Filtering must preserve the full record used for editing');
});
test('Resolved status also automatically selects resolution dates', () => {
  assert.deepEqual(ids(run({ status: 'RESOLVED', dateMode: 'DAY', day: '2026-10-16' })), ['closed-16']);
});
test('Resolution range includes both boundaries and filters findings within each inspection', () => {
  assert.deepEqual(ids(run({ dateBasis: 'RESOLVED', dateMode: 'RANGE', from: '2026-10-16', to: '2026-10-28' })), ['closed-28', 'closed-16', 'bogota-28']);
  assert.deepEqual(ids(run({ dateBasis: 'RESOLVED', dateMode: 'RANGE', from: '2026-10-29' })), ['bogota-29']);
});
test('Missing or invalid resolution dates never fall back to the inspection date', () => {
  assert.deepEqual(ids(run({ dateBasis: 'RESOLVED', dateMode: 'DAY', day: '2026-10-28' })), ['closed-28', 'bogota-28']);
});
test('An explicit inspection date overrides automatic Solved behavior', () => {
  assert.equal(qualityDateBasis({ ...defaults, dashboard: 'SOLVED', dateBasis: 'VISIT' }), 'VISIT');
  assert.deepEqual(ids(run({ dashboard: 'SOLVED', dateBasis: 'VISIT', dateMode: 'DAY', day: '2026-10-12' })), ['closed-28', 'closed-16', 'open']);
});
test('Pending and All keep inspection-date filtering by default', () => {
  assert.equal(qualityDateBasis({ ...defaults, dashboard: 'PENDING' }), 'VISIT');
  assert.deepEqual(ids(run({ dashboard: 'PENDING', dateMode: 'DAY', day: '2026-10-12' })), ['closed-28', 'closed-16', 'open']);
});
test('Date, property, technician, importance and estimate filters apply to the same finding', () => {
  assert.deepEqual(ids(run({ status: 'RESOLVED', dateMode: 'DAY', day: '2026-10-28', property: 'park', technician: 'Diego', severity: 'HIGH', estimate: 'REQUIRED' })), ['bogota-28']);
  assert.deepEqual(ids(run({ status: 'RESOLVED', dateMode: 'DAY', day: '2026-10-28', property: 'canopy', severity: 'HIGH' })), []);
});
test('All dates preserves resolved findings without dates and inspections without findings', () => {
  const empty = { id: 'empty', propertyId: 'empty', technicianName: 'Camilo', visitDate: '2026-10-29T12:00:00Z', findings: [] };
  assert.equal(run({}, [...visits, empty]).length, 3);
  assert.equal(ids(run()).length, 7);
  assert.equal(run({ dateBasis: 'RESOLVED', dateMode: 'DAY', day: '2026-10-28' }, [empty]).length, 0);
});
