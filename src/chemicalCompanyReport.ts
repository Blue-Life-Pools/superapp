export type CompanyChemicalTotal = {
  id: string; name: string; unit: string;
  recordedQuantity: number | null; maximum: number | null; expectedQuantity: number | null;
  baseMaximum?: number | null; updatedMaximum?: number | null;
  populationAdjusted?: boolean; adjustmentFactor?: number | null;
  comparableQuantity: number | null; comparisonMaximum: number | null;
  maximumSource?: 'HISTORY_2025' | 'MANUAL_COMPANY'; manualMonthlyMaximum?: number | null;
  percent: number | null; excessQuantity: number | null; remainingQuantity: number | null;
  referenceProperties: number; reportedReferenceProperties: number;
  referencePropertyMonths?: number; reportedReferencePropertyMonths?: number;
  unreferencedProperties: number; unreferencedQuantity: number; coverageComplete: boolean;
  georkyRefillQuantity: number;
  properties: Array<{
    propertyId: string; propertyName: string; recordedQuantity: number | null;
    maximum: number | null; expectedQuantity: number | null;
    referenceMaximum?: number | null;
    maximumSource?: 'HISTORY_2025' | 'WORKBOOK_PROPERTY' | null;
    comparableQuantity?: number | null; comparisonMaximum?: number | null;
    referenceMonths?: number; reportedMonths?: number;
  }>;
};

export type CompanyConsumptionReport = {
  month: string; scope: 'month' | 'global'; months: string[]; availableMonths: string[]; baselineYear: number;
  thresholds: { warning: number; attention: number; maximum: number };
  activeProperties: number; uploadedProperties: number; matchedHistoryProperties: number;
  basePropertyCount?: number | null;
  maximumReferenceSources?: string[];
  monthlyPropertyCounts?: Array<{ month: string; properties: number }>;
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
  const { percent } = companyChemicalMetrics(chemical);
  if (percent === null) return { level: 'empty', label: 'No maximum available' };
  if (percent > thresholds.maximum) return { level: 'high', label: 'Overconsumption' };
  if (percent >= thresholds.attention) return { level: 'attention', label: 'Attention' };
  if (percent >= thresholds.warning) return { level: 'warning', label: 'Early warning' };
  return { level: 'normal', label: 'Within range' };
}

export function companyChemicalMetrics(chemical: Pick<CompanyChemicalTotal, 'recordedQuantity' | 'maximum'>) {
  const { recordedQuantity, maximum } = chemical;
  const valid = recordedQuantity !== null && Number.isFinite(recordedQuantity) && maximum !== null && Number.isFinite(maximum) && maximum > 0;
  return {
    percent: valid ? recordedQuantity / maximum * 100 : null,
    excessQuantity: valid ? Math.max(0, recordedQuantity - maximum) : null,
    remainingQuantity: valid ? Math.max(0, maximum - recordedQuantity) : null,
  };
}

type PropertyConsumption = CompanyChemicalTotal['properties'][number];

export function sortCompanyProperties(properties: readonly PropertyConsumption[]) {
  return [...properties].sort((a, b) => {
    const aRecorded = a.recordedQuantity !== null && Number.isFinite(a.recordedQuantity);
    const bRecorded = b.recordedQuantity !== null && Number.isFinite(b.recordedQuantity);
    if (aRecorded !== bRecorded) return aRecorded ? -1 : 1;
    if (aRecorded && bRecorded && a.recordedQuantity !== b.recordedQuantity) return b.recordedQuantity! - a.recordedQuantity!;
    return a.propertyName.localeCompare(b.propertyName);
  });
}

export function companyPropertyStatus(property: Pick<PropertyConsumption, 'recordedQuantity' | 'maximum'>) {
  const { recordedQuantity, maximum } = property;
  if (recordedQuantity === null || !Number.isFinite(recordedQuantity) || recordedQuantity < 0) return { level: 'normal', label: 'No recorded consumption' };
  if (maximum === null || !Number.isFinite(maximum) || maximum < 0) return { level: 'normal', label: 'No property maximum available' };
  if (recordedQuantity > maximum) return { level: 'high', label: 'Over property maximum' };
  if (maximum > 0 && recordedQuantity >= maximum * .9) return { level: 'warning', label: 'Near property maximum (90–100%)' };
  return { level: 'normal', label: 'Within property maximum' };
}
