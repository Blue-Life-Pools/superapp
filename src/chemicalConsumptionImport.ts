export type ConsumptionChemical = { name: string; unit: string; quantity: number; cost: number };
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
    if (!propertyName) { warnings.push('Hay una línea de mantenimiento sin nombre de propiedad; se excluyó.'); continue; }
    const type = field(row, 'transaction type');
    const invoice = field(row, 'num');
    const description = field(row, 'description');
    if (type.toLowerCase() !== 'invoice') { warnings.push(`${propertyName}: transacción ${type} excluida; revisa su efecto en la mensualidad.`); continue; }
    if (!invoice) { warnings.push(`${propertyName}: falta el número de invoice; se excluyó la línea.`); continue; }
    if (/quarterly|trimestral|annual|anual|invoices\s*#/i.test(description)) {
      warnings.push(`${propertyName}: cargo trimestral, anual o de varias facturas excluido de la mensualidad (${invoice}).`);
      continue;
    }
    const amount = field(row, 'amount');
    const parsed = Number(amount.replace(/[$,\s]/g, '').replace(/^\((.+)\)$/, '-$1'));
    if (!amount || !Number.isFinite(parsed) || parsed < 0) { warnings.push(`${propertyName}: importe inválido o negativo en invoice ${invoice}; se excluyó.`); continue; }
    if (/partial|parcial/i.test(description)) warnings.push(`${propertyName}: invoice ${invoice} tiene facturación parcial; se usa el importe facturado del mes, sin convertirlo en tarifa de un mes completo.`);
    if (parsed === 0) warnings.push(`${propertyName}: invoice ${invoice} registra mantenimiento en $0; revisa antes de confirmar.`);
    const key = propertyName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toLowerCase();
    const group = groups.get(key) || { propertyName, cents: 0, invoices: new Set<string>() };
    group.cents += Math.round(parsed * 100);
    group.invoices.add(invoice);
    groups.set(key, group);
  }
  const rows: ConsumptionImportRow[] = [];
  for (const group of groups.values()) {
    if (group.invoices.size > 1) { warnings.push(`${group.propertyName}: tiene varias facturas de mantenimiento en ${month}. Se excluyó para comprobar que no se sumen mensualidades distintas.`); continue; }
    rows.push({ propertyName: group.propertyName, monthlyFee: group.cents / 100 });
  }
  if (otherCharges) warnings.unshift(`Se omitieron ${otherCharges} líneas de otras cuentas del mes: reparaciones, químicos extra y otros ingresos no se incluyen en la mensualidad.`);
  if (!rows.length) throw new Error(`No se encontraron invoices de mantenimiento importables para ${month}. Selecciona un mes incluido en el reporte.`);
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
  if (!range || range[1] !== range[4] || range[3] !== range[6]) throw new Error('El PDF debe corresponder a un solo mes.');
  const month = `${range[3]}-${range[1].padStart(2, '0')}`;
  const rows: ConsumptionImportRow[] = [];
  const warnings: string[] = [];
  let current: ConsumptionImportRow | null = null;
  let totalPending = false;
  let grandTotal: number | null = null;
  const complete = () => {
    const finished = current;
    const recordedTotal = grandTotal;
    current = null; grandTotal = null; totalPending = false;
    if (!finished) return;
    const sum = (finished.chemicals || []).reduce((value, chemical) => value + chemical.cost, 0);
    if (!finished.chemicals?.length || recordedTotal === null || Math.abs(sum - recordedTotal) > .03) {
      warnings.push(`${finished.propertyName}: no se pudo conciliar el detalle con el total. Se excluyó de la carga.`);
    } else { rows.push(finished); }
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/Grand Total for/i.test(line)) {
      if (!current) warnings.push(`${line.replace(/Grand Total for/i, '').split('(')[0].trim()}: no se pudo identificar su encabezado. Se excluyó de la carga.`);
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
      if (current) complete();
      const name = header[1].trim() || lines[i - 1]?.trim();
      if (!name || /Grand Total|Service Date/i.test(name)) continue;
      current = { propertyName: name, code: header[2].trim(), chemicals: [] };
      continue;
    }
    if (!current || /^\d{1,2}\/\d{1,2}\/\d{4}/.test(line)) continue;
    const summary = line.match(/^(.+?)\s+([\d,]+(?:\.\d+)?\s*[¼½¾]?|[¼½¾])\s+(\S+)\s+\(?\$([\d,]+\.\d{2})\)?\s+\$[\d,.]+/);
    if (!summary) continue;
    const [, name, quantity, unit, cost] = summary;
    const value = quantityValue(quantity);
    const amount = Number(cost.replace(/,/g, ''));
    const chemical = current.chemicals!.find((entry) => entry.name === name && entry.unit.toLowerCase() === unit.toLowerCase());
    if (chemical) { chemical.quantity += value; chemical.cost = Math.round((chemical.cost + amount) * 100) / 100; }
    else current.chemicals!.push({ name, quantity: value, unit, cost: amount });
  }
  if (current) complete();
  if (!rows.length) throw new Error('No se encontraron propiedades con cantidades y totales conciliados.');
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.code!, (counts.get(row.code!) || 0) + 1);
  const duplicates = new Set(rows.filter((row) => counts.get(row.code!)! > 1).map((row) => row.code!));
  for (const code of duplicates) warnings.push(`${rows.find((row) => row.code === code)!.propertyName}: aparecen varios totales con el mismo código. Se excluyó para revisar el alcance de esos registros.`);
  const accepted = rows.filter((row) => !duplicates.has(row.code!));
  if (!accepted.length) throw new Error('No quedaron propiedades sin duplicados para importar.');
  return { month, sourceName, rows: accepted, warnings: [...new Set(warnings)] };
}
