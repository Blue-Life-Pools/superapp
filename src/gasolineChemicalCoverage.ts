import { chemicalTechnicianResolver } from './chemicalTechnicianIdentity';
import { driverKey } from './gasolineData';

export type ChemicalProperty = {
  id: string;
  name: string;
  city: string | null;
  assigned: string[];
  participants: { name: string; dates: string[] }[];
};

type CoveredProperty = Pick<ChemicalProperty, 'id' | 'name' | 'city'> & {
  assignment: 'official' | 'additional' | 'unconfirmed';
  dates: string[];
  scope: 'in range' | 'month only' | 'outside range';
  counted: boolean;
};

export function gasolineChemicalCoverage(properties: ChemicalProperty[], drivers: string[], first: string, last: string) {
  const result = new Map<string, CoveredProperty[]>();
  if (!first || !last || !properties.length) return result;
  const month = first.slice(0, 7);
  const [year, monthNumber] = month.split('-').map(Number);
  const monthEnd = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const fullMonth = first === month + '-01' && last === month + '-' + monthEnd;
  const resolve = chemicalTechnicianResolver([
    ...drivers,
    ...properties.flatMap(property => [...property.assigned, ...property.participants.map(person => person.name)]),
  ]);
  const driverMatches = new Map<string, string[]>();
  for (const driver of drivers) {
    const identity = resolve(driver).key;
    if (identity) driverMatches.set(identity, [...(driverMatches.get(identity) ?? []), driverKey(driver)]);
  }
  for (const property of properties) {
    const assigned = new Set(property.assigned.map(name => resolve(name).key).filter(Boolean));
    const evidence = new Map([...assigned].map(key => [key, new Set<string>()]));
    for (const person of property.participants) {
      const key = resolve(person.name).key;
      if (!key) continue;
      const dates = evidence.get(key) ?? new Set<string>();
      person.dates.forEach(date => dates.add(date));
      evidence.set(key, dates);
    }
    for (const [identity, dates] of evidence) {
      const matched = driverMatches.get(identity);
      if (matched?.length !== 1) continue;
      const inRange = [...dates].filter(date => date >= first && date <= last).sort();
      const scope = inRange.length ? 'in range' : dates.size ? 'outside range' : 'month only';
      const entry: CoveredProperty = {
        id: property.id, name: property.name, city: property.city,
        assignment: assigned.has(identity) ? 'official' : assigned.size ? 'additional' : 'unconfirmed',
        dates: scope === 'in range' ? inRange : [...dates].sort(),
        scope, counted: scope === 'in range' || (scope === 'month only' && fullMonth),
      };
      const key = matched[0];
      const entries = result.get(key);
      if (entries) entries.push(entry);
      else result.set(key, [entry]);
    }
  }
  return result;
}
