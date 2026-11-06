const nameKey = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim().split(/\s+/).sort().join(' ');

// Confirmed names shared by Skimmer and the technician directory in Register.
const aliases = [
  ['Georky Quiñonez', 'Georky Quinones'],
  ['Nelson Belaunzaran', 'Nelson Belauzaran'],
  ['Jose Lugo'],
  ['Angel Viña'],
  ['Miguel Morales'],
  ['Javier Eduardo', 'Javier Llovera'],
] as const;
const canonicalNames = new Map<string, string>(aliases.flatMap(([name, ...variants]) => [name, ...variants].map((variant) => [nameKey(variant), name])));

export function cleanChemicalTechnicianName(raw: string) {
  const name = raw.replace(/\([^)]*\)/g, '').replace(/^\s*\d+\s*[-.]?\s*/, '')
    .replace(/\b\d+\.\s*main\b/gi, ' ')
    .replace(/\b(?:chlorine|acid|powder|included|front)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  return canonicalNames.get(nameKey(name)) || name;
}

export function chemicalTechnicianResolver(names: string[]) {
  const candidates = new Map<string, string>();
  for (const raw of names) {
    const name = cleanChemicalTechnicianName(raw);
    const key = nameKey(name);
    if (key && (!candidates.has(key) || name.localeCompare(candidates.get(key)!) < 0)) candidates.set(key, name);
  }
  // Resolve abbreviations against the complete name set, never against row order.
  const fullNames = [...candidates].filter(([key]) => key.includes(' ') && ![...candidates.keys()].some((other) => other !== key && key.split(' ').every((token) => other.split(' ').includes(token))));
  return (raw: string) => {
    const name = cleanChemicalTechnicianName(raw);
    const key = nameKey(name);
    const tokens = key.split(' ');
    const matches = fullNames.filter(([candidate]) => tokens.every((token) => candidate.split(' ').includes(token)));
    const match = matches.length === 1 ? matches[0] : [key, candidates.get(key) || name];
    return { key: match[0], name: match[1] };
  };
}
