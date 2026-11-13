import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import './ProposalInternalNameEditor.css';

export function ProposalInternalNameEditor({ name, disabled, onSave }: { name: string | null | undefined; disabled: boolean; onSave: (name: string) => Promise<void> }) {
  const inputId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try { await onSave(draft.trim()); setEditing(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the internal proposal name.'); }
    finally { setBusy(false); }
  }
  return <div className="proposal-name-editor">
    {editing ? <form onSubmit={event => void save(event)}><label htmlFor={inputId}>Internal proposal name<input id={inputId} autoFocus maxLength={120} value={draft} disabled={busy || disabled} placeholder="e.g. Pool and fountain · 2027 renewal" onChange={event => setDraft(event.target.value)} /></label><div><button type="submit" disabled={busy || disabled || draft.trim() === (name ?? '')}>{busy ? 'Saving…' : 'Save name'}</button><button type="button" disabled={busy} onClick={() => { setEditing(false); setError(''); }}>Cancel</button></div><small>Internal use only. Excluded from the PDF and customer email.</small></form> : <div className="proposal-name-display"><div><span>Internal proposal name</span><strong>{name || 'Not named'}</strong></div><button type="button" disabled={disabled} onClick={() => { setDraft(name ?? ''); setError(''); setEditing(true); }}>{name ? 'Edit name' : 'Add internal name'}</button></div>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
