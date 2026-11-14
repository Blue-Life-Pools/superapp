export const opportunityFields = [
  ['propertyName', 'Property', 'text', 'Estimate', 210], ['linkedPropertyName', 'Linked property', 'text', 'Estimate', 210],
  ['estimateNumber', 'Estimate number', 'text', 'Estimate', 100], ['estimateAmount', 'Estimate amount', 'money', 'Estimate', 130],
  ['status', 'Status', 'status', 'Estimate', 125], ['categories', 'Categories', 'categories', 'Estimate', 180],
  ['contractor', 'Contractor', 'text', 'Repair', 180], ['name', 'Opportunity name', 'long', 'Estimate', 320],
  ['creationDate', 'Created / received date', 'date', 'Estimate', 140], ['requestedBy', 'Requested by', 'text', 'Estimate', 160],
  ['approvalDate', 'Approval date', 'date', 'Approval', 125], ['approvedBy', 'Approved by', 'text', 'Approval', 160],
  ['estimatedRepairDate', 'Estimated repair date', 'date', 'Repair', 145], ['inSkimmer', 'Skimmer', 'boolean', 'Repair', 95],
  ['assignedTechnician', 'Assigned technician', 'text', 'Repair', 170], ['actualRepairDate', 'Actual repair date', 'date', 'Repair', 135],
  ['invoiceNumber', 'Invoice number', 'text', 'Invoice', 120], ['invoiceAmount', 'Invoice amount', 'money', 'Invoice', 130],
  ['invoiceDate', 'Invoice date', 'date', 'Invoice', 125], ['approvalTime', 'Time to approve', 'text', 'Approval', 125],
  ['repairTime', 'Time to repair', 'text', 'Repair', 125], ['invoiceTime', 'Time to invoice', 'text', 'Invoice', 125],
] as const;
export type OpportunityField = typeof opportunityFields[number][0];
export type Opportunity = { id: string; propertyId: string | null; source: string; sourceMailbox: string | null; receivedAt: string | null; updatedAt: string; categories: string[]; inSkimmer: boolean | null } & Record<Exclude<OpportunityField, 'categories' | 'inSkimmer'>, string | null>;
export type OpportunityDraft = Record<OpportunityField, string>;
export const defaultOpportunityColumns: OpportunityField[] = ['creationDate', 'estimateNumber', 'propertyName', 'name', 'estimateAmount', 'status', 'categories'];
export const opportunityStatuses = ['Pending', 'Accepted', 'Converted', 'Declined', 'Repair Done', 'N/A'];
export const dateOnly = (value: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US') : '—';
export const currency = (value: string | null) => value === null || value === '' ? '—' : Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
export const opportunityText = (value: string | null) => (value || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
export function opportunityDraft(item: Partial<Opportunity> | null): OpportunityDraft {
  return Object.fromEntries(opportunityFields.map(([field, , kind]) => [field, item ? kind === 'date' ? item[field]?.toString().slice(0, 10) || '' : field === 'categories' ? (item.categories || []).join(', ') : field === 'inSkimmer' ? item.inSkimmer == null ? '' : String(item.inSkimmer) : item[field] ?? (field === 'status' && item.status === undefined ? 'Pending' : '') : field === 'status' ? 'Pending' : ''])) as OpportunityDraft;
}
export function opportunityPayload(draft: OpportunityDraft) {
  return Object.fromEntries(opportunityFields.map(([field]) => [field, field === 'categories' ? draft.categories.split(',').map((value) => value.trim()).filter(Boolean) : field === 'inSkimmer' ? draft.inSkimmer === '' ? null : draft.inSkimmer === 'true' : draft[field].trim() || null]));
}
