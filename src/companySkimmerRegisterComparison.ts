export type CompanyConsumptionPeriod = { month: string; sourceName: string | null; chemicals: Array<{ name: string; quantity: number | string }> };
export type CompanyRegisterReport = { serviceDate: string; tabsQuantity: number | string; liquidChlorineGallons: number | string; muriaticAcidGallons: number | string; dePowderBags: number | string; stabilizerScoops: number | string };
type ChemicalKey = 'liquidchlorine' | 'muriaticacid' | 'tablets' | 'stabilizer' | 'de';
type ComparisonRow = { key: ChemicalKey; label: string; skimmer: number; register: number };

const chemicals: Array<{ key: ChemicalKey; label: string; registerField: keyof Omit<CompanyRegisterReport, 'serviceDate'> }> = [
  { key: 'liquidchlorine', label: 'Cloro líquido', registerField: 'liquidChlorineGallons' },
  { key: 'muriaticacid', label: 'Ácido', registerField: 'muriaticAcidGallons' },
  { key: 'tablets', label: 'Tabletas / Pastillas', registerField: 'tabsQuantity' },
  { key: 'stabilizer', label: 'Estabilizador', registerField: 'stabilizerScoops' },
  { key: 'de', label: 'DE', registerField: 'dePowderBags' },
];
const numeric = (value: number | string) => Number(value) || 0;
function chemicalKey(name: string): ChemicalKey | null {
  const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (key === 'liquid' || key.includes('liquidchlorine') || key.includes('cloroliquido')) return 'liquidchlorine';
  if (key === 'muriatic' || key.includes('muriaticacid') || key.includes('acidomuriatico')) return 'muriaticacid';
  if (key === 'tabs' || key.includes('tablet') || key.includes('clorotablet')) return 'tablets';
  if (key.includes('stabil')) return 'stabilizer';
  if (key === 'de' || key === 'defilter' || key.includes('depowder') || key.includes('filterpowder')) return 'de';
  return null;
}

export function companySkimmerRegisterComparison(periods: CompanyConsumptionPeriod[], reports: CompanyRegisterReport[], month: string): ComparisonRow[] {
  const totals = new Map<ChemicalKey, number>();
  for (const period of periods) {
    if (period.month !== month || !period.sourceName) continue;
    // Uploaded property totals include usage without an assigned technician or a withdrawal.
    for (const chemical of period.chemicals) {
      const key = chemicalKey(chemical.name);
      if (key) totals.set(key, (totals.get(key) || 0) + numeric(chemical.quantity));
    }
  }
  const monthlyReports = reports.filter((report) => report.serviceDate.slice(0, 7) === month);
  return chemicals.map(({ key, label, registerField }) => ({
    key, label, skimmer: totals.get(key) || 0,
    register: monthlyReports.reduce((sum, report) => sum + numeric(report[registerField]), 0),
  }));
}
