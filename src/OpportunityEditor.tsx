import { useState, type FormEvent } from 'react';
import { WorkspaceIcon } from './WorkspaceIcon';
import { currency, dateOnly, opportunityDraft, opportunityFields, opportunityPayload, opportunityStatuses, opportunityText, type Opportunity, type OpportunityField } from './opportunityFields';

export function OpportunityEditor({ item, initialValues, viewOnly = false, properties, statuses, onClose, onSave, onEdit }: {
  item: Opportunity | null; viewOnly?: boolean; properties: string[]; statuses: string[]; onClose: () => void;
  initialValues?: Partial<Opportunity>;
  onSave: (data: ReturnType<typeof opportunityPayload>, id?: string) => Promise<void>; onEdit: () => void;
}) {
  const [draft, setDraft] = useState(() => opportunityDraft(item || initialValues || null));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try { await onSave(opportunityPayload(draft), item?.id); onClose(); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  const statusOptions = [...new Set([...opportunityStatuses, ...statuses, ...(item?.status ? [item.status] : [])])];
  function display(field: OpportunityField, kind: string) {
    if (!item) return '—';
    if (kind === 'money') return currency(item[field] as string | null);
    if (kind === 'date') return dateOnly(item[field] as string | null);
    if (field === 'categories') return item.categories.join(', ') || '—';
    if (field === 'inSkimmer') return item.inSkimmer === null ? '—' : item.inSkimmer ? 'Yes' : 'No';
    return opportunityText(item[field] as string | null) || '—';
  }
  return <div className="modal-backdrop"><section className="property-modal opportunity-editor" role="dialog" aria-modal="true" aria-labelledby="opportunity-editor-title">
    <header className="opportunities-dialog-heading"><div><span>OPPORTUNITIES</span><h2 id="opportunity-editor-title">{viewOnly ? 'Opportunity details' : item ? 'Edit opportunity' : 'New opportunity'}</h2>{item && <p>{item.propertyName}{item.estimateNumber ? ` · Estimate #${item.estimateNumber}` : ''}</p>}</div><button type="button" aria-label="Close opportunity" disabled={busy} onClick={onClose}><WorkspaceIcon name="close" /></button></header>
    <form onSubmit={(event) => void submit(event)}>
      <div className="opportunity-editor-content">{(['Estimate', 'Approval', 'Repair', 'Invoice'] as const).map((group) => <fieldset key={group}><legend>{group}</legend><div className="opportunity-editor-fields">{opportunityFields.filter(([, , , section]) => section === group).map(([field, label, kind]) => <label key={field} className={kind === 'long' ? 'opportunity-field-wide' : ''}><span>{label}{field === 'propertyName' && !viewOnly ? ' *' : ''}</span>{viewOnly ? <strong>{display(field, kind)}</strong> : kind === 'long' ? <textarea aria-label={label} rows={3} value={draft[field]} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} /> : kind === 'status' ? <select aria-label={label} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="">Not recorded</option>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select> : kind === 'boolean' ? <select aria-label={label} value={draft.inSkimmer} onChange={(event) => setDraft({ ...draft, inSkimmer: event.target.value })}><option value="">Not recorded</option><option value="true">Yes</option><option value="false">No</option></select> : <input aria-label={label} required={field === 'propertyName'} type={kind === 'date' ? 'date' : kind === 'money' ? 'number' : 'text'} step={kind === 'money' ? '0.01' : undefined} list={field === 'propertyName' ? 'opportunity-property-options' : undefined} value={draft[field]} placeholder={kind === 'categories' ? 'Filter, Plumbing…' : undefined} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} />}</label>)}</div></fieldset>)}
        <datalist id="opportunity-property-options">{properties.map((name) => <option key={name} value={name} />)}</datalist>
        {item && <p className="opportunity-source-note">Source: {item.source === 'CSV' ? 'CSV import' : item.source === 'MICROSOFT_365' ? 'Microsoft 365 email' : item.source === 'POWER_AUTOMATE' ? 'Legacy import' : 'Manual entry'}{item.sourceMailbox ? ` · ${item.sourceMailbox}` : ''}</p>}
      </div>
      {error && <p className="opportunities-message" role="alert">{error}</p>}
      <footer className="opportunities-dialog-actions"><button type="button" className="opportunities-button opportunities-button-secondary" disabled={busy} onClick={onClose}>{viewOnly ? 'Close' : 'Cancel'}</button>{viewOnly ? <button type="button" className="opportunities-button opportunities-button-primary" onClick={onEdit}><WorkspaceIcon name="edit" />Edit opportunity</button> : <button type="submit" className="opportunities-button opportunities-button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save opportunity'}</button>}</footer>
    </form>
  </section></div>;
}
