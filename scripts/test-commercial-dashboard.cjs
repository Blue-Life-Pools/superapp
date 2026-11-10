const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const moduleResult = { exports: {} };
new Function('exports', 'module', ts.transpileModule(fs.readFileSync('src/commercialDashboardData.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(moduleResult.exports, moduleResult);
const { buildCommercialStats, commercialProposalMonths, commercialProposalTrend, proposalInPeriod } = moduleResult.exports;
const proposal = (month, amount, status) => ({ type: 'PROPOSAL', occurredAt: `${month}-01T00:00:00Z`, status, proposalData: { totalMonthlyInvestment: amount } });
const properties = [
  { propertyType: 'COMMERCIAL', lifecycleStatus: 'CLIENT', managementCompany: { name: 'Example' }, salesActivities: [proposal('2026-10', '556.25', 'CREATED'), proposal('2026-11', 980, 'APPROVED'), { type: 'CALL', occurredAt: '2026-11-01', proposalData: { totalMonthlyInvestment: 999 } }] },
  { propertyType: 'RESIDENTIAL', lifecycleStatus: 'LEAD', managementCompany: { name: 'Example' }, salesActivities: [proposal('2026-10', 203.75, null), proposal('2026-11', 592.5, 'SENT')] },
  { propertyType: null, lifecycleStatus: 'INACTIVE', managementCompany: null, salesActivities: [proposal('2027-01', 0, 'EXPIRED')] },
];
const all = buildCommercialStats(properties);
assert.equal(all.propertyCount, 3);
assert.equal(all.clientCount, 1);
assert.deepEqual(all.typeCounts, { COMMERCIAL: 1, RESIDENTIAL: 1, UNSPECIFIED: 1 });
assert.deepEqual(all.managementCounts, { Example: 2, Unassigned: 1 });
assert.equal(all.totalProposals, 5);
assert.equal(all.totalProposalValue, 2332.5);
assert.equal(all.proposalValues.CREATED, 760);
const october = buildCommercialStats(properties, '2026-10');
assert.equal(october.totalProposalValue, 760);
assert.equal(october.totalProposals, 2);
assert.equal(october.proposalValues.CREATED, 760);
assert.equal(october.propertyCount, all.propertyCount);
assert.equal(buildCommercialStats(properties, '2026-12').totalProposals, 0);
assert.deepEqual(commercialProposalMonths(properties), ['2027-01', '2026-11', '2026-10']);
assert.equal(proposalInPeriod(properties[0].salesActivities[2], 'all'), false);
const trend = commercialProposalTrend(properties, '2027-01');
assert.deepEqual(trend.map((row) => row.month), ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01']);
assert.deepEqual(trend.map((row) => row.value), [0, 0, 760, 1572.5, 0, 0]);
assert.equal(trend[5].count, 1);
assert.deepEqual(commercialProposalTrend([], 'all'), []);
assert.equal(buildCommercialStats([]).totalProposalValue, 0);
console.log('PASS: existing portfolio totals, exact proposal amounts, month and status selection, empty data and six-month trend across years');
