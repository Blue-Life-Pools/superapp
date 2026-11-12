import type { ConsumptionChemical } from './chemicalConsumptionImport';
import { englishChemicalName } from './chemicalConsumptionAlerts';
import { chemicalTechnicianResolver } from './chemicalTechnicianIdentity';

type Category = 'liquid' | 'tablets' | 'powder' | 'stabilizer' | 'acid' | 'other';
export type DisinfectionSelection = 'all' | 'sanitizer' | 'balance' | Category;
export type DisinfectionPeriod = { month?: string; sourceName: string | null; monthlyFee: number | null; chemicals: ConsumptionChemical[] };

export function disinfectionCategory(chemical: ConsumptionChemical): Category {
  const key = englishChemicalName(chemical.name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  if (key.includes('stabilizer') || key.includes('estabilizador')) return 'stabilizer';
  if (key.includes('muriatic') || key.includes('acid') || key.includes('acido')) return 'acid';
  if (key.includes('liquid') || key.includes('cloro liquido')) return 'liquid';
  if (/\b(tablets?|tabs?|pastillas?|tabletas?)\b/.test(key)) return 'tablets';
  if ((key.includes('chlorine') || key.includes('cloro')) && (key.includes('powder') || key.includes('polvo'))) return 'powder';
  return 'other';
}

export function disinfectionTotals(chemicals: ConsumptionChemical[]) {
  const totals: Record<Category | 'total', number> = { liquid: 0, tablets: 0, powder: 0, stabilizer: 0, acid: 0, other: 0, total: 0 };
  for (const chemical of chemicals) {
    const cost = Number(chemical.cost) || 0;
    totals[disinfectionCategory(chemical)] += cost;
    totals.total += cost;
  }
  return totals;
}

export function disinfectionChemicals(chemicals: ConsumptionChemical[], selection: DisinfectionSelection) {
  return chemicals.filter((chemical) => {
    const category = disinfectionCategory(chemical);
    const sanitizer = ['liquid', 'tablets', 'powder'].includes(category);
    return selection === 'all' || (selection === 'sanitizer' ? sanitizer : selection === 'balance' ? !sanitizer : category === selection);
  });
}

export function disinfectionUsageDetails(chemicals: ConsumptionChemical[]) {
  type Usage = { name: string; quantity: number; cost: number };
  type Product = { name: string; unit: string; quantity: number; cost: number; technicians: Map<string, Usage> };
  const products = new Map<string, Product>();
  const resolveTechnician = chemicalTechnicianResolver(chemicals.flatMap((chemical) => (chemical.technicians ?? []).map((item) => item.name)));
  for (const chemical of chemicals) {
    const name = englishChemicalName(chemical.name);
    const key = `${name.toLowerCase()}:${chemical.unit.trim().toLowerCase()}`;
    const product = products.get(key) ?? { name, unit: chemical.unit, quantity: 0, cost: 0, technicians: new Map<string, Usage>() };
    product.quantity += chemical.quantity;
    product.cost += chemical.cost;
    for (const item of chemical.technicians ?? []) {
      const technician = resolveTechnician(item.name);
      const personKey = technician.key || 'not-recorded';
      const usage = product.technicians.get(personKey) ?? { name: technician.name || 'Not recorded', quantity: 0, cost: 0 };
      usage.quantity += item.quantity;
      usage.cost += item.cost;
      product.technicians.set(personKey, usage);
    }
    products.set(key, product);
  }
  return [...products.values()].map((product) => {
    const technicians = [...product.technicians.values()];
    const missingQuantity = Math.max(0, product.quantity - technicians.reduce((sum, usage) => sum + usage.quantity, 0));
    const missingCost = Math.max(0, product.cost - technicians.reduce((sum, usage) => sum + usage.cost, 0));
    if (missingQuantity > .00005 || missingCost > .005 || technicians.length === 0) {
      const unrecorded = technicians.find((usage) => usage.name === 'Not recorded');
      if (unrecorded) { unrecorded.quantity += missingQuantity; unrecorded.cost += missingCost; }
      else technicians.push({ name: 'Not recorded', quantity: missingQuantity, cost: missingCost });
    }
    return { ...product, technicians: technicians.sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name)) };
  });
}
