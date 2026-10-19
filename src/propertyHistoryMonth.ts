import { healthDate } from './healthDisplay';
import { healthHistoryDate } from './propertyHistory';
import type { PropertyHealthTicket } from './propertyHistory';

// Reports and inspection dates are business dates; visit/creation timestamps use Colombia time.
export function matchesHistoryMonth(value: string | null | undefined, month: string, timestamp = false) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !value) return false;
  if (!timestamp || /^\d{4}-\d{2}-\d{2}$/.test(value)) return healthDate(value).slice(0, 7) === month;
  if (!healthDate(value)) return false;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit' }).formatToParts(date);
  return `${parts.find((part) => part.type === 'year')!.value}-${parts.find((part) => part.type === 'month')!.value}` === month;
}

export function filterPropertyHistoryByMonth<H extends PropertyHealthTicket, R extends { occurredAt: string }, C extends { createdAt: string }, Q extends { visitDate: string }>(records: { tickets: H[]; reports: R[]; complaints: C[]; qualityInspections: Q[] }, month: string) {
  return {
    tickets: records.tickets.filter((ticket) => matchesHistoryMonth(healthHistoryDate(ticket), month)),
    reports: records.reports.filter((report) => matchesHistoryMonth(report.occurredAt, month)),
    complaints: records.complaints.filter((complaint) => matchesHistoryMonth(complaint.createdAt, month, true)),
    qualityInspections: records.qualityInspections.filter((inspection) => matchesHistoryMonth(inspection.visitDate, month, true)),
  };
}
