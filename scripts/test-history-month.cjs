const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file) {
  const code = ts.transpileModule(fs.readFileSync(`src/${file}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const result = { exports: {} };
  new Function('exports', 'module', 'require', code)(result.exports, result, (name) => load(name.replace('./', '')));
  return result.exports;
}
const { filterPropertyHistoryByMonth, matchesHistoryMonth } = load('propertyHistoryMonth');
const { indexPropertyHealthTickets } = load('propertyHistory');
const health = (id, visitDate, receivedAt, extra = {}) => ({ ticketNumber: id, propertyName: 'Sample Property', visitDate, receivedAt, healthData: {}, status: 'NEW', ...extra });
const records = {
  tickets: [
    health('inspection', '2026-09-20', '2026-10-03T12:00:00Z'),
    health('old-inspection', '2026-08-20', '2026-09-03T12:00:00Z'),
    health('received', null, '2026-09-03T12:00:00Z'),
    health('legacy', null, '2026-10-01T12:00:00Z', { healthData: { 'Fecha de Inicio': '9/25/2026' }, status: 'CLOSED' }),
  ],
  reports: [{ id: 'september', occurredAt: '2026-09-01T00:00:00.000Z', status: 'PENDING' }, { id: 'october', occurredAt: '2026-10-01T00:00:00.000Z', status: 'SOLVED' }],
  complaints: [{ id: 'local-september', createdAt: '2026-10-01T02:00:00Z', status: 'OPEN' }, { id: 'local-october', createdAt: '2026-10-01T06:00:00Z', status: 'IN_PROGRESS' }],
  qualityInspections: [{ id: 'local-september', visitDate: '2026-10-01T02:00:00Z', findings: [{ status: 'OPEN' }] }, { id: 'local-october', visitDate: '2026-10-01T06:00:00Z', findings: [{ status: 'OPEN' }] }],
};
const original = JSON.stringify(records);
const september = filterPropertyHistoryByMonth(records, '2026-09');
assert.deepEqual(september.tickets.map((row) => row.ticketNumber), ['inspection', 'received', 'legacy']);
assert.deepEqual(september.reports.map((row) => row.id), ['september']);
assert.deepEqual(september.complaints.map((row) => row.id), ['local-september']);
assert.deepEqual(september.qualityInspections.map((row) => row.id), ['local-september']);
assert.equal(september.tickets[2].status, 'CLOSED', 'Month filtering preserves statuses; existing status filters still apply');
const index = indexPropertyHealthTickets([{ id: 'property', name: 'Sample Property' }], september.tickets);
assert.equal(index.byProperty.get('property').length, 3, 'Property history and counters use the same monthly records');
assert.equal(index.byProperty.get('property').filter((row) => row.status !== 'CLOSED').length, 2);
const october = filterPropertyHistoryByMonth(records, '2026-10');
assert.deepEqual(october.reports.map((row) => row.id), ['october']);
assert.deepEqual(october.complaints.map((row) => row.id), ['local-october']);
assert.deepEqual(october.qualityInspections.map((row) => row.id), ['local-october']);
assert.equal(JSON.stringify(records), original, 'Switching months does not discard or mutate source history');
assert.equal(matchesHistoryMonth('2026-01-01T02:00:00Z', '2025-12', true), true);
assert.equal(matchesHistoryMonth('2026-01-01T00:00:00Z', '2026-01'), true);
assert.equal(matchesHistoryMonth('2024-02-29', '2024-02'), true);
for (const value of ['', null, 'invalid', '2025-02-30T12:00:00Z']) assert.equal(matchesHistoryMonth(value, '2025-03', true), false);
assert.equal(matchesHistoryMonth('2026-09-01', '2026-13'), false);
console.log('PASS: all Home histories filter by month, business dates, Colombia timestamp boundaries, Health fallback, retained statuses and source preservation');
