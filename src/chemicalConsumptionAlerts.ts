// Match recorded chlorine products without classifying acid or unspecified shock as chlorine.
export function isChlorineChemical(name: string) {
  const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ['liquid', 'liquidchlorine', 'chlorine', 'cloro', 'cloroliquido', 'tabs', 'tablets', 'chlorinetablets', 'cloroentabletas'].includes(key);
}

export function chlorineOverages<C extends { name: string; status: string; expectedMax: number | null; excessPercent?: number | null }>(periods: Array<{ propertyId: string; chemicals: C[] }>) {
  return periods.flatMap((period) => period.chemicals.filter((chemical) => isChlorineChemical(chemical.name) && chemical.status === 'HIGH' && chemical.expectedMax != null).map((chemical) => ({ propertyId: period.propertyId, chemical }))).sort((a, b) => (b.chemical.excessPercent ?? 0) - (a.chemical.excessPercent ?? 0));
}
