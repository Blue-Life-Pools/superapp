const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(`src/${file}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('exports', 'module', 'require', code)(module.exports, module, name => name.startsWith('./') ? load(name.slice(2)) : require(name));
  return module.exports;
}
const { calculateProposal, commercialBasePrice, chemicalRateForSize, defaultLaborPerVisit } = load('proposalCostModel');
const { allocateProposalCosts } = load('proposalPricing');
const pool = { id: 'pool', name: 'Pool', type: 'SWIMMING_POOL', include: true, category: 'MEDIUM', gallons: 40000, monthlyPrice: 700, frequency: '3x Weekly', disinfectionSystem: true, accessDifficulty: 'SIMPLE', priceManuallyAdjusted: false, priceMode: 'SUGGESTED', laborCostPerVisit: 10.77, laborManuallyAdjusted: false };
const fountain = { ...pool, id: 'fountain', name: 'Fountain', type: 'DECORATIVE_WATER_FEATURE', category: '', gallons: null, monthlyPrice: 150, laborCostPerVisit: 2.31 };
const settings = { targetMarginPercent: 60, discountPercent: 0, surchargePercent: 0, chemicalsIncluded: true, chemicalProjection: 84.45 };
const near = (value, expected) => assert.ok(Math.abs(value - expected) < .005, `${value} != ${expected}`);
assert.equal(commercialBasePrice(pool).price, 700, 'Simple access must not add 3%');
assert.equal(commercialBasePrice(fountain).price, 150);
assert.equal(commercialBasePrice({ ...pool, category: 'SMALL' }).price, 600);
assert.equal(commercialBasePrice({ ...pool, accessDifficulty: 'COMPLEX' }).price, 735);
assert.equal(commercialBasePrice({ ...pool, disinfectionSystem: false }).price, 735);
assert.equal(commercialBasePrice({ ...pool, frequency: '5x Weekly' }).price, 945);
assert.equal(defaultLaborPerVisit('SWIMMING_POOL', 'MEDIUM'), 10.77);
assert.equal(defaultLaborPerVisit('DECORATIVE_WATER_FEATURE', ''), 2.31);
for (const [size, rate] of [['SMALL', .17], ['MEDIUM', .22], ['LARGE', .24], ['EXTRA_LARGE', .24], ['', .2], ['UNKNOWN', .2], [null, .2], [undefined, .2]]) assert.equal(chemicalRateForSize(size), rate);
const result = calculateProposal([pool, fountain], settings);
assert.deepEqual([result.total, result.chemicalCost, result.chemicalBudget, result.laborCost, result.laborBudget, result.supplies, result.administration, result.estimatedGasoline, result.totalCost, result.profit, result.priceReference], [850, 84.45, 184, 170.04, 170, 17, 17, 12.75, 301.24, 548.76, 740]);
near(result.marginPercent, 64.56);
for (const discountPercent of [0, 5, 7.5, 20, 33.3, 99, 100]) {
  const quote = calculateProposal([pool, fountain], { ...settings, discountPercent });
  assert.equal(quote.allocations.reduce((sum, line) => sum + line.monthlyCents, 0), quote.total * 100);
  assert.equal(quote.allocations.reduce((sum, line) => sum + line.fuelCents, 0), 0);
  near(quote.totalCost + quote.profit, quote.total);
  assert.equal(quote.chemicalCost, 84.45, 'A discount must not reduce a dollar chemical forecast');
  assert.equal(quote.laborCost, 170.04, 'A discount must not reduce planned pay per visit');
  const exported = quote.lines.filter(line => line.body.include).map(line => ({ description: line.body.name, type: line.body.type, frequency: line.body.frequency, baseMonthlyCost: line.grossPrice }));
  assert.deepEqual(allocateProposalCosts(exported, 0, discountPercent, quote.total), quote.allocations);
}
for (const [price, rate] of [[999, .2], [1000, .2], [1001, .16], [1200, .16]]) {
  const quote = calculateProposal([{ ...pool, monthlyPrice: price, priceManuallyAdjusted: true }], settings);
  assert.equal(quote.lines[0].costs.laborRate, rate);
  near(quote.laborBudget, price * rate);
}
const discounted = calculateProposal([{ ...pool, monthlyPrice: 1200, priceManuallyAdjusted: true }], { ...settings, discountPercent: 20 });
assert.equal(discounted.total, 960);
assert.equal(discounted.lines[0].costs.laborRate, .2, 'Labor budget tier applies after management adjustments');
assert.deepEqual(calculateProposal([pool, pool], settings).lines.map(line => line.costs.laborRate), [.2, .2], 'Threshold must apply per body, not property total');
const surcharge = calculateProposal([pool, fountain], { ...settings, surchargePercent: 5 });
assert.equal(surcharge.total, 893);
assert.deepEqual(surcharge.lines.map(line => line.grossPrice), [735, 157.5]);
assert.equal(surcharge.managementAdjustment, 43);
const noHistory = calculateProposal([pool, fountain], { ...settings, chemicalProjection: null });
assert.equal(noHistory.chemicalCost, 184);
assert.equal(noHistory.priceReference, null, 'Cannot solve a target price using a circular price-based forecast');
const scope = calculateProposal([pool, { ...fountain, include: false }], settings);
assert.equal(scope.total, 700);
assert.equal(scope.chemicalCost, 84.45, 'Do not invent a split for property-level recorded costs');
assert.equal(scope.laborCost, 140.01);
assert.equal(calculateProposal([pool], { ...settings, chemicalProjection: 0 }).chemicalCost, 0);
assert.equal(calculateProposal([pool], { ...settings, chemicalsIncluded: false }).chemicalCost, 0);
assert.equal(calculateProposal([pool], { ...settings, chemicalProjection: 200 }).overconsumption, true);
assert.equal(calculateProposal([pool], { ...settings, targetMarginPercent: 90 }).total, 700, 'Target must not silently change the quote');
assert.equal(calculateProposal([{ ...pool, include: false }], settings).total, 0);
console.log('PASS: simple access 0%, base/frequency adjustments, size budgets, historical-dollar forecasting, per-visit labor, per-body tiers after discount, one gasoline allocation, management markup, PDF reconciliation, and excluded scope.');
