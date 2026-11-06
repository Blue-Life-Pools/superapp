import { chemicalTechnicianResolver } from './chemicalTechnicianIdentity';

type TechnicianUsage = { name: string; quantity: number };
type ConsumptionChemical = { name: string; quantity: number | string; technicians?: TechnicianUsage[] };
export type ConsumptionPeriod = { chemicals: ConsumptionChemical[] };
export type TechnicianReport = { serviceDate: string; technicianName: string; tabsQuantity: number | string; liquidChlorineGallons: number | string; muriaticAcidGallons: number | string; dePowderBags: number | string };
export type ChemicalKey = 'liquidchlorine' | 'muriaticacid' | 'tablets' | 'de';
export type TechnicianRow = { key: string; name: string; values: Record<ChemicalKey, { skimmer: number; register: number }> };
const keys: ChemicalKey[] = ['liquidchlorine', 'muriaticacid', 'tablets', 'de'];
const numeric = (value: number | string | null | undefined) => Number(value) || 0;
function chemicalKey(value: string): ChemicalKey | null {
  const key = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  if (['liquid', 'liquidchlorine', 'cloroliquido'].includes(key)) return 'liquidchlorine';
  if (['muriatic', 'muriaticacid', 'acidomuriatico'].includes(key)) return 'muriaticacid';
  if (['tabs', 'tablets', 'chlorinetablets', 'cloroentabletas'].includes(key)) return 'tablets';
  if (['de', 'depowder', 'defilter', 'defilterpowder'].includes(key)) return 'de';
  return null;
}

export function technicianChemicalComparison(periods: ConsumptionPeriod[], reports: TechnicianReport[]): TechnicianRow[] {
  const names = [...periods.flatMap((period) => period.chemicals.flatMap((chemical) => (chemical.technicians || []).map((usage) => usage.name))), ...reports.map((report) => report.technicianName)];
  const resolve = chemicalTechnicianResolver(names);
  const rows = new Map<string, TechnicianRow>();
  const getRow = (raw: string) => {
    const identity = resolve(raw);
    if (!identity.key) return null;
    let row = rows.get(identity.key);
    if (!row) {
      row = { ...identity, values: { liquidchlorine: { skimmer: 0, register: 0 }, muriaticacid: { skimmer: 0, register: 0 }, tablets: { skimmer: 0, register: 0 }, de: { skimmer: 0, register: 0 } } };
      rows.set(identity.key, row);
    }
    return row;
  };
  for (const period of periods) for (const chemical of period.chemicals) {
    const key = chemicalKey(chemical.name);
    if (!key) continue;
    for (const usage of chemical.technicians || []) {
      const row = getRow(usage.name);
      if (row) row.values[key].skimmer += numeric(usage.quantity);
    }
  }
  for (const report of reports) {
    const row = getRow(report.technicianName);
    if (!row) continue;
    row.values.liquidchlorine.register += numeric(report.liquidChlorineGallons);
    row.values.muriaticacid.register += numeric(report.muriaticAcidGallons);
    row.values.tablets.register += numeric(report.tabsQuantity);
    row.values.de.register += numeric(report.dePowderBags);
  }
  const balance = (row: TechnicianRow) => keys.reduce((sum, key) => sum + row.values[key].register - row.values[key].skimmer, 0);
  return [...rows.values()].filter((row) => keys.some((key) => row.values[key].skimmer || row.values[key].register))
    .sort((a, b) => balance(b) - balance(a) || a.name.localeCompare(b.name));
}
