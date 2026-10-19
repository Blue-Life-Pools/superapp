// Match recorded chlorine products without classifying acid or unspecified shock as chlorine.
export function chemicalReportMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit' }).formatToParts(now);
  return `${parts.find((part) => part.type === 'year')!.value}-${parts.find((part) => part.type === 'month')!.value}`;
}

export function englishChemicalName(name: string) {
  const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const labels: Record<string, string> = { liquid: 'Liquid Chlorine', liquidchlorine: 'Liquid Chlorine', cloroliquido: 'Liquid Chlorine', cloro: 'Chlorine', tabs: 'Chlorine Tablets', tablets: 'Chlorine Tablets', estabilizador: 'Stabilizer', bicarbonato: 'Bicarbonate', sal: 'Salt', acidomuriatico: 'Muriatic Acid', cloroenpolvo: 'Chlorine Powder' };
  return labels[key] || name;
}

export function isChlorineChemical(name: string) {
  const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ['liquid', 'liquidchlorine', 'chlorine', 'cloro', 'cloroliquido', 'tabs', 'tablets', 'chlorinetablets', 'cloroentabletas'].includes(key);
}

export function chlorineOverages<C extends { name: string; status: string; expectedMax: number | null; excessPercent?: number | null }>(periods: Array<{ propertyId: string; chemicals: C[] }>) {
  return periods.flatMap((period) => period.chemicals.filter((chemical) => isChlorineChemical(chemical.name) && chemical.status === 'HIGH' && chemical.expectedMax != null).map((chemical) => ({ propertyId: period.propertyId, chemical }))).sort((a, b) => (b.chemical.excessPercent ?? 0) - (a.chemical.excessPercent ?? 0));
}
