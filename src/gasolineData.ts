import { readExcelRows } from './excelRows';

export type FuelPurchase = {
  id: string;
  date: string;
  driver: string;
  city: string;
  product: string;
  gallons: number;
  cents: number;
  reportedMiles: number | null;
};

export type FuelRoute = { zone: string; properties: number | null; miles: number | null };
export type FuelData = { purchases: FuelPurchase[]; routes: Record<string, FuelRoute>; archivedPropertyCounts?: Record<string, number> };

const gallonsUnits = new Set(['GA', 'GAL', 'GALLON', 'GALLONS']);
const dayMilliseconds = 86_400_000;

function purchaseDate(value: string, date1904: boolean) {
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const days = Math.floor(Number(value));
    const date = new Date(Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30) + days * dayMilliseconds);
    return days > 0 && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(value);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:$| )/.exec(value);
  if (!iso && !us) return null;
  const [year, month, day] = iso ? iso.slice(1, 4).map(Number) : [Number(us![3]), Number(us![1]), Number(us![2])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.toISOString().slice(0, 10) : null;
}

export const driverKey = (name: string) => name.normalize('NFKC').toLowerCase();

export async function readWawaTransactions(file: File) {
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Choose a Wawa Transactions Excel (.xlsx) file.');
  const { rows, date1904 } = await readExcelRows(file);
  const headerIndex = rows.findIndex(row => [...row.values()].some(value => value.trim().toLowerCase() === 'transaction date'));
  const columns = new Map<string, string>();
  rows[headerIndex]?.forEach((value, column) => columns.set(value.trim().toLowerCase(), column));
  const required = ['transaction date', 'trans id', 'units', 'unit of measure', 'net cost', 'driver first name', 'driver last name'];
  if (!required.every(header => columns.has(header))) throw new Error('The file is missing required columns from the Wawa Transactions report.');

  const purchases = new Map<string, FuelPurchase>();
  for (const [index, row] of rows.slice(headerIndex + 1).entries()) {
    const value = (label: string) => row.get(columns.get(label) ?? '')?.trim() ?? '';
    if (!gallonsUnits.has(value('unit of measure').toUpperCase())) continue;
    const date = purchaseDate(value('transaction date'), date1904);
    const id = value('trans id');
    const gallons = Number(value('units'));
    const cost = Number(value('net cost'));
    const rawDistance = value('distance driven');
    const reportedMiles = rawDistance ? Number(rawDistance) : null;
    if (!date || !id || !value('units') || !value('net cost') || !Number.isFinite(gallons) || !Number.isFinite(cost)) {
      throw new Error(`Invalid fuel transaction on row ${headerIndex + index + 2}. Check the date, transaction ID, gallons and cost.`);
    }
    if (gallons === 0 && cost === 0) continue;
    const driver = [value('driver first name'), value('driver last name')].filter(Boolean).join(' ').replace(/\s+/g, ' ');
    const purchase = {
      id, date, driver, city: value('merchant city'), product: value('product description'),
      gallons: cost < 0 ? -Math.abs(gallons) : gallons,
      cents: Math.round(cost * 100),
      reportedMiles: reportedMiles !== null && Number.isFinite(reportedMiles) && reportedMiles >= 0 ? reportedMiles : null,
    };
    const previous = purchases.get(id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(purchase)) {
      throw new Error('The report contains conflicting rows for the same transaction ID.');
    }
    purchases.set(id, purchase);
  }
  if (!purchases.size) throw new Error('No fuel transactions were found in this report.');
  return [...purchases.values()];
}

export function summarizeFuel(purchases: FuelPurchase[], month: string) {
  const drivers = new Map<string, { key: string; name: string; cents: number; gallons: number; charges: number; purchases: FuelPurchase[] }>();
  let spent = 0;
  let gallons = 0;
  let charges = 0;
  let largestDistance = 0;
  let first = '';
  let last = '';
  for (const purchase of purchases) {
    if (!purchase.date.startsWith(month + '-')) continue;
    const key = driverKey(purchase.driver);
    const driver = drivers.get(key) ?? { key, name: purchase.driver || 'Unassigned driver', cents: 0, gallons: 0, charges: 0, purchases: [] };
    driver.cents += purchase.cents;
    driver.gallons += purchase.gallons;
    driver.purchases.push(purchase);
    if (purchase.gallons > 0) {
      driver.charges++;
      charges++;
    }
    drivers.set(key, driver);
    spent += purchase.cents;
    gallons += purchase.gallons;
    largestDistance = Math.max(largestDistance, purchase.reportedMiles ?? 0);
    if (!first || purchase.date < first) first = purchase.date;
    if (purchase.date > last) last = purchase.date;
  }
  return { drivers: [...drivers.values()], spent, gallons, charges, largestDistance, first, last };
}
