export type ConsumptionTechnicianUsage = { name: string; quantity: number; cost: number };
export type ConsumptionChemical = { name: string; unit: string; quantity: number; cost: number; technicians?: ConsumptionTechnicianUsage[] };
export type ConsumptionImportRow = { propertyName: string; code?: string; propertyId?: string; chemicals?: ConsumptionChemical[]; monthlyFee?: number };
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
  return groups.sort((a, b) => b.y - a.y).map((group) => group.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(' ').replace(/\s+/g, ' ').trim());
}
function quantityValue(raw: string) {
  const fractions: Record<string, number> = { '¼': .25, '½': .5, '¾': .75 };
  const match = raw.match(/[¼½¾]/);
  return Number(raw.replace(/[¼½¾]/g, '').replace(/,/g, '').trim() || '0') + (match ? fractions[match[0]] : 0);
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
  let lastDetailUsage: ConsumptionTechnicianUsage | null = null;
  const complete = () => {
    const finished = current;
    const recordedTotal = grandTotal;
    current = null; grandTotal = null; totalPending = false; technicianDetails.clear(); lastDetailUsage = null;
    if (!finished) return;
    const sum = (finished.chemicals || []).reduce((value, chemical) => value + chemical.cost, 0);
    if (!finished.chemicals?.length || recordedTotal === null || Math.abs(sum - recordedTotal) > .03) {
      warnings.push(`${finished.propertyName}: the line items could not be reconciled with the total and were excluded from the import.`);
    } else { rows.push(finished); }
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
    const header = line.match(/^(.*?)\s*\(([A-Z0-9][A-Z0-9 -]{5,})\)\s*$/);
    if (header && !line.includes('$')) {
      lastDetailUsage = null;
      if (current) complete();
      const name = header[1].trim() || lines[i - 1]?.trim();
      if (!name || /Grand Total|Service Date/i.test(name)) continue;
      current = { propertyName: name, code: header[2].trim(), chemicals: [] };
      continue;
    }
    if (!current) continue;
    if (lastDetailUsage && /^[A-Za-zÀ-ÿ.'-]+$/.test(line)) {
      lastDetailUsage.name = `${lastDetailUsage.name} ${line}`;
      lastDetailUsage = null;
      continue;
    }
    lastDetailUsage = null;
    const detail = line.match(/^\d{1,2}\/\d{1,2}\/\d{4}\s+(.+?)\s+((?:Back )?Pool)\s+(.+?)\s+([\d,]+(?:\.\d+)?\s*[Â¼Â½Â¾]?|[Â¼Â½Â¾])\s+(\S+)\s+\(?\$([\d,]+\.\d{2})\)?/i);
    if (detail) {
      const [, technician, , name, quantity, unit, cost] = detail;
      const key = `${name.trim()}|${unit.toLowerCase()}`;
      const usages = technicianDetails.get(key) || [];
      const existing = usages.find((usage) => usage.name.toLowerCase() === technician.trim().toLowerCase());
      const value = quantityValue(quantity);
      const amount = Number(cost.replace(/,/g, ''));
      if (existing) { existing.quantity += value; existing.cost = Math.round((existing.cost + amount) * 100) / 100; }
      else usages.push({ name: technician.trim(), quantity: value, cost: amount });
      technicianDetails.set(key, usages);
      lastDetailUsage = usages[usages.length - 1];
      continue;
    }
    const summary = line.match(/^(.+?)\s+([\d,]+(?:\.\d+)?\s*[¼½¾]?|[¼½¾])\s+(\S+)\s+\(?\$([\d,]+\.\d{2})\)?\s+\$[\d,.]+/);
    if (!summary) continue;
    const [, name, quantity, unit, cost] = summary;
    const value = quantityValue(quantity);
    const amount = Number(cost.replace(/,/g, ''));
    const chemical = current.chemicals!.find((entry) => entry.name === name && entry.unit.toLowerCase() === unit.toLowerCase());
    const rawTechnicians = technicianDetails.get(`${name}|${unit.toLowerCase()}`);
    const technicians = rawTechnicians?.reduce<ConsumptionTechnicianUsage[]>((merged, usage) => {
      const existing = merged.find((item) => item.name.toLowerCase() === usage.name.toLowerCase());
      if (existing) {
        existing.quantity += usage.quantity;
        existing.cost = Math.round((existing.cost + usage.cost) * 100) / 100;
      } else {
        merged.push({ ...usage });
      }
      return merged;
    }, []);
    if (chemical) { chemical.quantity += value; chemical.cost = Math.round((chemical.cost + amount) * 100) / 100; if (technicians?.length) chemical.technicians = technicians; }
    else current.chemicals!.push({ name, quantity: value, unit, cost: amount, ...(technicians?.length ? { technicians } : {}) });
  }
  if (current) complete();
  if (!rows.length) throw new Error('No properties with reconciled quantities and totals were found.');
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.code!, (counts.get(row.code!) || 0) + 1);
  const duplicates = new Set(rows.filter((row) => counts.get(row.code!)! > 1).map((row) => row.code!));
  for (const code of duplicates) warnings.push(`${rows.find((row) => row.code === code)!.propertyName}: multiple totals share the same code; excluded pending a scope review.`);
  const accepted = rows.filter((row) => !duplicates.has(row.code!));
  if (!accepted.length) throw new Error('No properties without duplicates remain to import.');
  return { month, sourceName, rows: accepted, warnings: [...new Set(warnings)] };
}
