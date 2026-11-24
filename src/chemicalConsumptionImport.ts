import { cleanChemicalTechnicianName } from './chemicalTechnicianIdentity';

export type ConsumptionTechnicianUsage = { name: string; quantity: number; cost: number; serviceDates?: string[] };
export type ConsumptionChemical = { name: string; unit: string; quantity: number; cost: number; technicians?: ConsumptionTechnicianUsage[] };
export type ConsumptionImportRow = { propertyName: string; code?: string; addressLine1?: string; propertyId?: string; chemicals?: ConsumptionChemical[]; monthlyFee?: number };
export type ConsumptionFile = { month: string; sourceName: string; rows: ConsumptionImportRow[]; warnings: string[] };

function transactionMonth(value: string) {
  const usDate = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usDate) return `${usDate[3]}-${usDate[1].padStart(2, '0')}`;
  const isoDate = value.match(/^(\d{4}-\d{2})-\d{2}/);
  if (isoDate) return isoDate[1];
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Number(value) * 86400000);
    if (Number.isFinite(date.getTime())) return date.toISOString().slice(0, 7);
  }
  return null;
}

export function parseQuickBooksMonthlyFees(sheetRows: Map<string, string>[], month: string, sourceName: string): ConsumptionFile | null {
  const headerIndex = sheetRows.findIndex((row) => {
    const values = [...row.values()].map((value) => value.trim().toLowerCase());
    return ['transaction date', 'transaction type', 'name', 'account name', 'amount'].every((header) => values.includes(header));
  });
  if (headerIndex < 0) return null;
  const headers = new Map<string, string>();
  sheetRows[headerIndex].forEach((value, column) => headers.set(value.trim().toLowerCase(), column));
  const field = (row: Map<string, string>, name: string) => (row.get(headers.get(name) || '') || '').trim();
  const groups = new Map<string, { propertyName: string; cents: number; invoices: Set<string> }>();
  const warnings: string[] = [];
  let otherCharges = 0;
  for (const row of sheetRows.slice(headerIndex + 1)) {
    const date = field(row, 'transaction date');
    if (!date || transactionMonth(date) !== month) continue;
    const account = field(row, 'account name');
    // Select only recurring maintenance accounts, excluding the sibling Extra Chemical account.
    if (!/(?:COMMERCIAL|RESIDENTIAL) MAINTENANCE/i.test(account)) { otherCharges++; continue; }
    const propertyName = field(row, 'name');
    if (!propertyName) { warnings.push('A maintenance line has no property name and was excluded.'); continue; }
    const type = field(row, 'transaction type');
    const invoice = field(row, 'num');
    const description = field(row, 'description');
    if (type.toLowerCase() !== 'invoice') { warnings.push(`${propertyName}: transaction ${type} excluded; review its effect on the monthly fee.`); continue; }
    if (!invoice) { warnings.push(`${propertyName}: missing invoice number; the line was excluded.`); continue; }
    if (/quarterly|trimestral|annual|anual|invoices\s*#/i.test(description)) {
      warnings.push(`${propertyName}: quarterly, annual or combined-invoice charge excluded from the monthly fee (${invoice}).`);
      continue;
    }
    const amount = field(row, 'amount');
    const parsed = Number(amount.replace(/[$,\s]/g, '').replace(/^\((.+)\)$/, '-$1'));
    if (!amount || !Number.isFinite(parsed) || parsed < 0) { warnings.push(`${propertyName}: invalid or negative amount on invoice ${invoice}; excluded.`); continue; }
    if (/partial|parcial/i.test(description)) warnings.push(`${propertyName}: invoice ${invoice} has partial billing; the billed amount is used without converting it into a full-month fee.`);
    if (parsed === 0) warnings.push(`${propertyName}: invoice ${invoice} records maintenance at $0; review before confirming.`);
    const key = propertyName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toLowerCase();
    const group = groups.get(key) || { propertyName, cents: 0, invoices: new Set<string>() };
    group.cents += Math.round(parsed * 100);
    group.invoices.add(invoice);
    groups.set(key, group);
  }
  const rows: ConsumptionImportRow[] = [];
  for (const group of groups.values()) {
    if (group.invoices.size > 1) { warnings.push(`${group.propertyName}: has multiple maintenance invoices in ${month}. Excluded to avoid combining fees from different months.`); continue; }
    rows.push({ propertyName: group.propertyName, monthlyFee: group.cents / 100 });
  }
  if (otherCharges) warnings.unshift(`Excluded ${otherCharges} other-account lines for this month: repairs, extra chemicals and other income are not part of the monthly fee.`);
  if (!rows.length) throw new Error(`No importable maintenance invoices found for ${month}. Select a month included in the report.`);
  return { month, sourceName, rows, warnings: [...new Set(warnings)] };
}

export function pdfTextLines(items: Array<{ str: string; transform: number[] }>) {
  const groups: Array<{ y: number; items: Array<{ x: number; text: string }> }> = [];
  for (const item of items) {
    if (!item.str.trim()) continue;
    let group = groups.find((entry) => Math.abs(entry.y - item.transform[5]) < 2);
    if (!group) { group = { y: item.transform[5], items: [] }; groups.push(group); }
    group.items.push({ x: item.transform[4], text: item.str });
  }
  const ordered = groups.sort((a, b) => b.y - a.y);
  const boundariesFor = (y: number) => {
    const header = items.filter((item) => item.str.trim() === 'Tech' && item.transform[5] > y).sort((a, b) => a.transform[5] - b.transform[5])[0];
    if (!header) return null;
    const headerX = (label: RegExp) => items.find((item) => label.test(item.str.trim()) && Math.abs(item.transform[5] - header.transform[5]) < 9)?.transform[4];
    const tech = header.transform[4], body = headerX(/^Body of(?: Water)?$/), chemical = headerX(/^Chemical$/);
    const dosage = headerX(/^Dosage$/), cost = headerX(/^Cost$/), price = headerX(/^Price(?: w\/)?$/);
    return [body, chemical, dosage, cost, price].every((x) => x !== undefined)
      ? [tech - 2, body! - 2, chemical! - 2, (chemical! + dosage!) / 2, (dosage! + cost!) / 2, (cost! + price!) / 2] : null;
  };
  const text = (group: typeof groups[number]) => group.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(' ').replace(/\s+/g, ' ').trim();
  const lines: string[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const group = ordered[i];
    const boundaries = boundariesFor(group.y);
    const column = (x: number) => boundaries?.filter((boundary) => x >= boundary).length ?? 0;
    if (!boundaries || !/^\d{1,2}\/\d{1,2}\/\d{4}\s/.test(text(group)) || !text(group).includes('$')) {
      lines.push(text(group));
      continue;
    }
    // Keep wrapped names, water bodies and chemicals in their own PDF columns.
    const cells: string[][] = Array.from({ length: 7 }, () => []);
    const append = (row: typeof group) => row.items.sort((a, b) => a.x - b.x).forEach((item) => cells[column(item.x)].push(item.text.trim()));
    append(group);
    while (i + 1 < ordered.length) {
      const next = ordered[i + 1];
      const gap = ordered[i].y - next.y;
      if (gap > 20 || next.items.some((item) => ![1, 2, 3, 6].includes(column(item.x))) || /\$/.test(text(next))) break;
      append(next); i++;
    }
    lines.push(cells.map((cell) => cell.join(' ').replace(/\s+/g, ' ').trim()).join('\t'));
  }
  return lines;
}
function quantityValue(raw: string) {
  const fractions: Record<string, number> = { '¼': .25, '½': .5, '¾': .75 };
  const match = raw.match(/[¼½¾]/);
  return Number(raw.replace(/[¼½¾]/g, '').replace(/,/g, '').trim() || '0') + (match ? fractions[match[0]] : 0);
}

const skimmerProductAliases: Record<string, string> = {
  liquid: 'liquidchlorine', cloroliquido: 'liquidchlorine',
  muriatic: 'muriaticacid', acidomuriatico: 'muriaticacid',
  tablets: 'tabs', chlorinetablets: 'tabs', cloroentabletas: 'tabs',
  estabilizador: 'stabilizer', defilter: 'defilterpowder', depowder: 'defilterpowder',
  cloroenpolvo: 'chlorinepowder', bicarbonato: 'bicarbonate', sal: 'salt',
  fosfato: 'phosphates', fosfatos: 'phosphates', phosphate: 'phosphates',
};
const skimmerUnitAliases: Record<string, string> = {
  gallon: 'gal', gallons: 'gal', gals: 'gal', bags: 'bag', scoops: 'scoop',
  units: 'qty', unit: 'qty', quantity: 'qty', ounces: 'oz', ounce: 'oz',
};
function skimmerDosageKey(name: string, unit: string) {
  const product = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedUnit = unit.trim().toLowerCase();
  return `${skimmerProductAliases[product] ?? product}|${skimmerUnitAliases[normalizedUnit] ?? normalizedUnit}`;
}

export function parseSkimmerDosages(lines: string[], sourceName: string): ConsumptionFile {
  const range = lines.join('\n').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[-–]\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!range || range[1] !== range[4] || range[3] !== range[6]) throw new Error('The PDF must cover a single month.');
  const month = `${range[3]}-${range[1].padStart(2, '0')}`;
  const rows: ConsumptionImportRow[] = [];
  const warnings: string[] = [];
  let current: ConsumptionImportRow | null = null;
  let totalPending = false;
  let grandTotal: number | null = null;
  const technicianDetails = new Map<string, ConsumptionTechnicianUsage[]>();
  const rowDetails = new Map<ConsumptionImportRow, string[]>();
  let detailSignatures: string[] = [];
  let lastDetailUsage: ConsumptionTechnicianUsage | null = null;
  const mergeUsage = (target: ConsumptionTechnicianUsage, usage: ConsumptionTechnicianUsage) => {
    target.quantity += usage.quantity;
    target.cost = Math.round((target.cost + usage.cost) * 100) / 100;
    if (usage.serviceDates?.length) target.serviceDates = [...new Set([...(target.serviceDates ?? []), ...usage.serviceDates])].sort();
  };
  const complete = () => {
    const finished = current;
    const recordedTotal = grandTotal;
    const finishedDetails = detailSignatures;
    detailSignatures = [];
    current = null; grandTotal = null; totalPending = false; lastDetailUsage = null;
    const details = new Map(technicianDetails);
    technicianDetails.clear();
    if (!finished) return;
    if (!finished.chemicals?.length && !finishedDetails.length && recordedTotal === null) return;
    const sum = (finished.chemicals || []).reduce((value, chemical) => value + chemical.cost, 0);
    if (!finished.chemicals?.length || recordedTotal === null || Math.abs(sum - recordedTotal) > .03) {
      warnings.push(`${finished.propertyName}: the line items could not be reconciled with the total and were excluded from the import.`);
      return;
    }
    for (const chemical of finished.chemicals) {
      const usagesByName = new Map<string, ConsumptionTechnicianUsage>();
      for (const usage of details.get(skimmerDosageKey(chemical.name, chemical.unit)) ?? []) {
        const name = usage.name.toLowerCase();
        const previous = usagesByName.get(name);
        if (previous) mergeUsage(previous, usage);
        else usagesByName.set(name, { ...usage });
      }
      const usages = [...usagesByName.values()];
      const assigned = usages.reduce((total, usage) => total + usage.quantity, 0);
      const assignedCost = usages.reduce((total, usage) => total + usage.cost, 0);
      if (usages.length && assigned <= chemical.quantity + .0001 && assignedCost <= chemical.cost + .03) chemical.technicians = usages;
      if (Math.abs(assigned - chemical.quantity) > .0001 || Math.abs(assignedCost - chemical.cost) > .03) {
        warnings.push(`${finished.propertyName}: incomplete technician breakdown for ${chemical.name}.`);
      }
    }
    rows.push(finished);
    rowDetails.set(finished, finishedDetails);
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/Grand Total for/i.test(line)) {
      if (!current) warnings.push(`${line.replace(/Grand Total for/i, '').split('(')[0].trim()}: the property header could not be identified and was excluded from the import.`);
      totalPending = true;
      const amount = line.match(/\(?\$([\d,]+\.\d{2})\)?/);
      if (amount) { grandTotal = Number(amount[1].replace(/,/g, '')); complete(); }
      continue;
    }
    if (totalPending) {
      const amount = line.match(/\(?\$([\d,]+\.\d{2})\)?/);
      if (amount) { grandTotal = Number(amount[1].replace(/,/g, '')); complete(); }
      continue;
    }
    const header = line.match(/^(.*?)\s*\(([A-Z0-9][A-Z0-9 -]*)\)\s*$/);
    if (header && !line.includes('$')) {
      lastDetailUsage = null;
      if (current) complete();
      const name = header[1].trim() || lines[i - 1]?.trim();
      if (!name || /Grand Total|Service Date/i.test(name)) continue;
      const address = /^\d+[A-Za-z]?\s+\S/.test(lines[i + 1] || '') ? lines[i + 1].trim() : undefined;
      current = { propertyName: name, code: header[2].trim(), ...(address ? { addressLine1: address } : {}), chemicals: [] };
      continue;
    }
    const address = lines[i + 1];
    if (line && !/[\t$()]/.test(line) && /^\d+[A-Za-z]?\s+\S/.test(address || '') && lines.slice(i + 2, i + 7).some((next) => /Tech.*Chemical.*Dosage/.test(next))) {
      if (current) complete();
      current = { propertyName: line.trim(), addressLine1: address.trim(), chemicals: [] };
      continue;
    }
    if (!current) continue;
    if (lastDetailUsage && /^[A-Za-zÀ-ÿ.'-]+$/.test(line) && !/^(?:Chlorine|Acid|Powder|Included|Front)$/i.test(line)) {
      lastDetailUsage.name = cleanChemicalTechnicianName(`${lastDetailUsage.name} ${line}`);
      lastDetailUsage = null;
      continue;
    }
    lastDetailUsage = null;
    const detail = line.includes('\t')
      ? line.match(/^\d{1,2}\/\d{1,2}\/\d{4}\t([^\t]+)\t([^\t]+)\t([^\t]+)\t([\d,]+(?:\.\d+)?\s*[¼½¾]?|[¼½¾])\s+(\S+)\t\(?\$([\d,]+\.\d{2})\)?/i)
      : line.match(/^\d{1,2}\/\d{1,2}\/\d{4}\s+(.+?)\s+((?:Back )?Pool)\s+(.+?)\s+([\d,]+(?:\.\d+)?\s*[¼½¾]?|[¼½¾])\s+(\S+)\s+\(?\$([\d,]+\.\d{2})\)?/i);
    if (detail) {
      const [, technician, , name, quantity, unit, cost] = detail;
      const key = skimmerDosageKey(name, unit);
      const usages = technicianDetails.get(key) || [];
      const technicianName = cleanChemicalTechnicianName(technician);
      const value = quantityValue(quantity);
      const amount = Number(cost.replace(/,/g, ''));
      const rawDate = line.match(/^\d{1,2}\/\d{1,2}\/\d{4}/)![0];
      const [serviceMonth, serviceDay, serviceYear] = rawDate.split('/');
      const serviceDate = `${serviceYear}-${serviceMonth.padStart(2, '0')}-${serviceDay.padStart(2, '0')}`;
      const usage = { name: technicianName, quantity: value, cost: amount, serviceDates: [serviceDate] };
      detailSignatures.push(JSON.stringify([rawDate, technicianName.toLowerCase(), detail[2].trim().toLowerCase(), name.trim().toLowerCase(), unit.toLowerCase(), value, amount]));
      usages.push(usage);
      technicianDetails.set(key, usages);
      lastDetailUsage = line.includes('\t') ? null : usage;
      continue;
    }
    const summary = line.match(/^(.+?)\s+([\d,]+(?:\.\d+)?\s*[¼½¾]?|[¼½¾])\s+(\S+)\s+\(?\$([\d,]+\.\d{2})\)?\s+\$[\d,.]+/);
    if (!summary) continue;
    const [, name, quantity, unit, cost] = summary;
    const value = quantityValue(quantity);
    const amount = Number(cost.replace(/,/g, ''));
    const key = skimmerDosageKey(name, unit);
    const chemical = current.chemicals!.find(entry => skimmerDosageKey(entry.name, entry.unit) === key);
    if (chemical) { chemical.quantity += value; chemical.cost = Math.round((chemical.cost + amount) * 100) / 100; }
    else current.chemicals!.push({ name, quantity: value, unit, cost: amount });
  }
  if (current) complete();
  if (!rows.length) throw new Error('No properties with reconciled quantities and totals were found.');
  const grouped = new Map<string, ConsumptionImportRow[]>();
  for (const row of rows) {
    const addressKey = row.addressLine1?.toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = row.code ? /\s+-\s+/.test(row.code) ? `${row.code}|${addressKey}` : row.code : `${row.propertyName.toLowerCase()}|${addressKey}`;
    grouped.set(key, [...(grouped.get(key) || []), row]);
  }
  const accepted: ConsumptionImportRow[] = [];
  for (const group of grouped.values()) {
    if (group.length === 1) { accepted.push(group[0]); continue; }
    const seen = new Set<string>();
    const completeDetails = group.every((row) => {
      const details = rowDetails.get(row)!;
      const reconciled = details.length > 0 && row.chemicals!.every((chemical) => Math.abs(chemical.quantity - (chemical.technicians || []).reduce((sum, usage) => sum + usage.quantity, 0)) < .0001 && Math.abs(chemical.cost - (chemical.technicians || []).reduce((sum, usage) => sum + usage.cost, 0)) <= .03);
      // Separate service-location totals can share visits; only an identical whole block is a duplicate.
      const fingerprint = JSON.stringify([row.addressLine1?.toLowerCase().replace(/[^a-z0-9]/g, '') || '', [...details].sort()]);
      const duplicate = seen.has(fingerprint);
      seen.add(fingerprint);
      return reconciled && !duplicate;
    });
    if (!completeDetails) {
      warnings.push(`${group[0].propertyName}: repeated property blocks overlap completely or have incomplete technician details; excluded pending a scope review.`);
      continue;
    }
    const chemicals: ConsumptionChemical[] = [];
    for (const row of group) for (const item of row.chemicals!) {
      const key = skimmerDosageKey(item.name, item.unit);
      let chemical = chemicals.find(other => skimmerDosageKey(other.name, other.unit) === key);
      if (!chemical) { chemical = { ...item, quantity: 0, cost: 0, technicians: [] }; chemicals.push(chemical); }
      chemical.quantity += item.quantity;
      chemical.cost = Math.round((chemical.cost + item.cost) * 100) / 100;
      for (const usage of item.technicians || []) {
        const existing = chemical.technicians!.find((other) => other.name.toLowerCase() === usage.name.toLowerCase());
        if (existing) mergeUsage(existing, usage);
        else chemical.technicians!.push({ ...usage });
      }
    }
    accepted.push({ ...group[0], chemicals });
  }
  if (!accepted.length) throw new Error('No properties without duplicates remain to import.');
  return { month, sourceName, rows: accepted, warnings: [...new Set(warnings)] };
}
