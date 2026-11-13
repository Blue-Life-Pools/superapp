import { allocateProposalCosts } from './proposalPricing';

export type ProposalWaterBody = {
  id: string; name: string; type: string; include: boolean; category: string; gallons: number | null;
  monthlyPrice: number; frequency: string; disinfectionSystem: boolean; accessDifficulty: 'SIMPLE' | 'COMPLEX';
  priceManuallyAdjusted: boolean; priceMode: 'SUGGESTED' | 'CUSTOM';
};
export type ProposalOverheadSettings = { suppliesPercent: number; administrationPercent: number; gasolinePercent: number };
export type CalculatorSettings = {
  targetMarginPercent: number; discountPercent: number; surchargePercent: number;
  chemicalsIncluded: boolean; chemicalProjection: number | null;
} & ProposalOverheadSettings;
export type ProposalContext = {
  chemicalHistory: { averageMonthlyCost: number | null; months: number; from: string | null; to: string | null };
  latestFee: { month: string; monthlyFee: number } | null;
};
export const poolBasePrices: Record<string, number> = { SMALL: 600, MEDIUM: 700, LARGE: 900, EXTRA_LARGE: 1300 };
const otherBasePrices: Record<string, number> = { SPA: 250, KIDDIE_POOL: 400, SPLASH_PAD: 400, DECORATIVE_WATER_FEATURE: 150 };
export const frequencyMultipliers: Record<string, number> = { '1x Weekly': .55, '2x Weekly': .8, '3x Weekly': 1, '5x Weekly': 1.35, '7x Weekly': 1.65 };
export const chemicalRatesBySize: Record<string, number> = { SMALL: .17, MEDIUM: .22, LARGE: .24, EXTRA_LARGE: .24 };
export const calculatorRates = { chemicalDefault: .2, labor: .2, supplies: .02, administration: .02, gasoline: .015 } as const;
export const defaultProposalOverhead: ProposalOverheadSettings = { suppliesPercent: 2, administrationPercent: 2, gasolinePercent: 1.5 };
export const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const nonnegative = (n: number) => Number.isFinite(n) ? Math.max(0, n) : 0;
const percentageRate = (n: number) => Math.min(100, nonnegative(n)) / 100;

export function chemicalRateForSize(size: string | null | undefined) {
  return chemicalRatesBySize[size?.trim().toUpperCase() || ''] ?? calculatorRates.chemicalDefault;
}
export function categoryBasePrice(type: string, category: string) {
  return type === 'SWIMMING_POOL' ? poolBasePrices[category] ?? 700 : otherBasePrices[type] ?? 150;
}
export function commercialBasePrice(body: ProposalWaterBody) {
  const categoryBase = categoryBasePrice(body.type, body.category);
  const frequency = frequencyMultipliers[body.frequency] ?? 1;
  const access = body.accessDifficulty === 'COMPLEX' ? 1.05 : 1;
  const disinfection = body.disinfectionSystem ? 1 : 1.05;
  return { categoryBase, frequency, access, disinfection, price: Math.ceil(roundMoney(categoryBase * frequency * access * disinfection)) };
}

export function calculateProposal(bodies: ProposalWaterBody[], settings: CalculatorSettings) {
  const rates = { labor: calculatorRates.labor, supplies: percentageRate(settings.suppliesPercent), administration: percentageRate(settings.administrationPercent), gasoline: percentageRate(settings.gasolinePercent) };
  const discount = Math.min(100, nonnegative(settings.discountPercent));
  const surcharge = nonnegative(settings.surchargePercent) / 100;
  const quotes = bodies.map(body => body.priceManuallyAdjusted ? Math.ceil(nonnegative(body.monthlyPrice)) : commercialBasePrice(body).price);
  const grossPrices = quotes.map(price => roundMoney(price * (1 + surcharge)));
  const included = bodies.flatMap((body, index) => body.include ? [{ description: body.name, type: body.type, frequency: body.frequency, baseMonthlyCost: grossPrices[index] }] : []);
  const subtotal = roundMoney(quotes.reduce((sum, price, index) => sum + (bodies[index].include ? price : 0), 0));
  const grossSubtotal = included.reduce((sum, body) => sum + body.baseMonthlyCost, 0);
  // Preserve the existing whole-dollar proposal/PDF allocation contract.
  const total = Math.max(0, Math.ceil(grossSubtotal * (1 - discount / 100) - 1e-8));
  const allocations = allocateProposalCosts(included, 0, discount, total);
  let allocationIndex = 0;
  const lines = bodies.map((body, index) => {
    const revenue = body.include ? allocations[allocationIndex++].monthlyCents / 100 : 0;
    const chemicalRate = settings.chemicalsIncluded ? chemicalRateForSize(body.category) : 0;
    return { body, base: commercialBasePrice(body), quotePrice: quotes[index], grossPrice: grossPrices[index], chemicalRate,
      costs: body.include ? { revenue, chemicalBudget: roundMoney(revenue * chemicalRate), laborRate: rates.labor, labor: roundMoney(revenue * rates.labor) } : null };
  });
  const sum = (key: keyof NonNullable<typeof lines[number]['costs']>) => roundMoney(lines.reduce((total, line) => total + (line.costs?.[key] ?? 0), 0));
  const chemicalBudget = sum('chemicalBudget');
  const chemicalCost = !settings.chemicalsIncluded ? 0 : settings.chemicalProjection === null ? chemicalBudget : roundMoney(nonnegative(settings.chemicalProjection));
  const laborCost = roundMoney(total * rates.labor), supplies = roundMoney(total * rates.supplies), administration = roundMoney(total * rates.administration), estimatedGasoline = roundMoney(total * rates.gasoline);
  const totalCost = roundMoney(chemicalCost + laborCost + supplies + administration + estimatedGasoline);
  const profit = roundMoney(total - totalCost);
  const denominator = 1 - settings.targetMarginPercent / 100 - rates.labor - rates.supplies - rates.administration - rates.gasoline;
  // Labor is now a percentage of the final fee, so it belongs in the denominator.
  // Only a fixed dollar chemical forecast can define a non-circular price reference.
  const priceReference = included.length && (settings.chemicalProjection !== null || !settings.chemicalsIncluded) && denominator > 0 ? Math.ceil((chemicalCost / denominator - 1e-8) / 10) * 10 : null;
  return { lines, allocations, rates, subtotal, total, managementAdjustment: roundMoney(total - subtotal), chemicalCost, chemicalBudget, laborCost, supplies, administration, estimatedGasoline, totalCost, profit, marginPercent: total > 0 ? profit / total * 100 : null, priceReference, targetSupportedByRates: denominator > 0, overconsumption: chemicalCost > chemicalBudget + .005 };
}
export type ProposalCalculation = ReturnType<typeof calculateProposal>;
