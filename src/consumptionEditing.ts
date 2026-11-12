import type { ConsumptionChemical } from './chemicalConsumptionImport';

export type ConsumptionEditMode = 'chemicals' | 'calculation' | 'waterBodies' | 'technician';
export type EditableWaterBody = { id?: string; name: string; type: string; size: string | null; gallons: number | null; active: boolean; technicianName: string | null };

export function editableChemicals(chemicals: ConsumptionChemical[]): ConsumptionChemical[] {
  return chemicals.map(({ name, unit, quantity, cost, technicians }) => ({ name, unit, quantity, cost, ...(technicians ? { technicians: technicians.map(entry => ({ ...entry })) } : {}) }));
}

// Preserve usage occurrences and the recorded cost shares, including unassigned cost.
export function changeChemicalCost(chemical: ConsumptionChemical, cost: number): ConsumptionChemical {
  let cumulative = 0, assignedCents = 0;
  const technicians = chemical.technicians?.map(entry => {
    cumulative += entry.cost;
    const nextCents = chemical.cost > 0 ? Math.round(Math.round(cost * 100) * Math.min(cumulative / chemical.cost, 1)) : 0;
    const result = { ...entry, cost: (nextCents - assignedCents) / 100 };
    assignedCents = nextCents;
    return result;
  });
  return { ...chemical, cost, ...(technicians ? { technicians } : {}) };
}

export function chemicalEditError(chemicals: ConsumptionChemical[]): string {
  const keys = new Set<string>();
  for (const chemical of chemicals) {
    if (!chemical.name.trim() || !chemical.unit.trim()) return 'Enter a chemical name and unit.';
    const key = `${chemical.name.trim().toLowerCase()}|${chemical.unit.trim().toLowerCase()}`;
    if (keys.has(key)) return 'Combine duplicate chemicals with the same unit before saving.';
    keys.add(key);
    const entries = chemical.technicians || [];
    if (entries.some(entry => !entry.name.trim())) return `${chemical.name}: enter a name for each technician.`;
    if ([chemical, ...entries].some(entry => !Number.isFinite(entry.quantity) || !Number.isFinite(entry.cost) || entry.quantity < 0 || entry.cost < 0)) return 'Quantities and costs must be zero or greater.';
    if (entries.reduce((sum, entry) => sum + entry.quantity, 0) > chemical.quantity + .0001) return `${chemical.name}: technician quantities exceed the total. Correct the usage entries below.`;
    if (entries.reduce((sum, entry) => sum + entry.cost, 0) > chemical.cost + .01) return `${chemical.name}: technician costs exceed the total. Correct the usage entries below.`;
  }
  return '';
}
