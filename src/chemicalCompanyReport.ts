export type CompanyChemicalTotal = {
  id: string; name: string; unit: string;
  recordedQuantity: number | null; maximum: number | null; expectedQuantity: number | null;
  comparableQuantity: number | null; comparisonMaximum: number | null;
  percent: number | null; excessQuantity: number | null; remainingQuantity: number | null;
  referenceProperties: number; reportedReferenceProperties: number;
  referencePropertyMonths?: number; reportedReferencePropertyMonths?: number;
  unreferencedProperties: number; unreferencedQuantity: number; coverageComplete: boolean;
  georkyRefillQuantity: number;
  properties: Array<{
    propertyId: string; propertyName: string; recordedQuantity: number | null;
    maximum: number | null; expectedQuantity: number | null;
    comparableQuantity?: number | null; comparisonMaximum?: number | null;
    referenceMonths?: number; reportedMonths?: number;
  }>;
};

export type CompanyConsumptionReport = {
  month: string; scope: 'month' | 'global'; months: string[]; availableMonths: string[]; baselineYear: number;
  thresholds: { warning: number; attention: number; maximum: number };
  activeProperties: number; uploadedProperties: number; matchedHistoryProperties: number;
  sources: string[]; chemicals: CompanyChemicalTotal[];
};

export function companyReportPeriodOptions(availableMonths: string[], selected: string) {
  return [...new Set([...availableMonths, ...(selected === 'global' ? [] : [selected])])]
    .filter((month) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month)).sort().reverse();
}

export function companyReportMonthLabel(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function companyChemicalStatus(chemical: CompanyChemicalTotal, thresholds: CompanyConsumptionReport['thresholds']) {
  if (chemical.recordedQuantity === null) return { level: 'empty', label: 'No Skimmer data' };
  if (chemical.percent === null) return { level: 'empty', label: 'No comparable reference' };
  if (chemical.percent > thresholds.maximum) return { level: 'high', label: chemical.coverageComplete ? 'Overconsumption' : 'Overconsumption · Comparable properties' };
  if (chemical.percent >= thresholds.attention) return { level: 'attention', label: 'Attention' };
  if (chemical.percent >= thresholds.warning) return { level: 'warning', label: 'Early warning' };
  return chemical.coverageComplete ? { level: 'normal', label: 'Within range' } : { level: 'partial', label: 'Partial coverage' };
}

export function companyChartScale(chemicals: CompanyChemicalTotal[]) {
  return Math.max(200, Math.ceil(Math.max(0, ...chemicals.map((chemical) => chemical.percent ?? 0)) / 50) * 50);
}
