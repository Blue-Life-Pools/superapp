import { useEffect, useState } from 'react';
import { API_URL, apiFetch } from './api';
import { WorkspaceIcon } from './WorkspaceIcon';
import { OpportunityEditor } from './OpportunityEditor';
import { currency, dateOnly, type Opportunity, type opportunityPayload } from './opportunityFields';

export type OpportunityMailStatus = { configured: boolean; mailbox: string; enabled: boolean; automatic: boolean; lastSyncAt: string | null; lastScheduledSyncAt: string | null; lastReceivedAt: string | null; lastError: string | null; hasMore: boolean; imported: number; linked: number; review: number; schedule: string };
type ReviewMessage = { id: string; subject: string; receivedAt: string; reason: string; parsedFields: Partial<Opportunity>; candidates?: Array<{ id: string; propertyName: string; status: string | null; estimateAmount: string | null; creationDate: string | null }> };
type SyncResult = { paused?: boolean; busy?: boolean; created: number; linked: number; review: number; hasMore: boolean };
async function mailRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(`${API_URL}/opportunities${path}`, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.message === 'string' ? data.message : 'Could not complete this action.');
  return data as T;
}
const when = (value: string | null | undefined) => value ? new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not yet';
export function OpportunityMailDialog({ initial, properties, statuses, onClose, onChange }: { initial: OpportunityMailStatus | null; properties: string[]; statuses: string[]; onClose: () => void; onChange: () => void }) {
  const [status, setStatus] = useState(initial), [reviews, setReviews] = useState<ReviewMessage[]>([]);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [reviewing, setReviewing] = useState<ReviewMessage | null>(null);
  const [linkTargets, setLinkTargets] = useState<Record<string, string>>({});
  async function refresh(signal?: AbortSignal) {
    const [next, review] = await Promise.all([mailRequest<OpportunityMailStatus>('/integration', { signal }), mailRequest<ReviewMessage[]>('/mail/review', { signal })]);
    setStatus(next); setReviews(review);
  }
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch((failure: Error) => { if (!controller.signal.aborted) setError(failure.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) { if (reviewing) setReviewing(null); else onClose(); } };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [busy, onClose, reviewing]);
  async function enable(enabled: boolean) {
    setBusy(true); setError(''); setMessage('');
    try { await mailRequest('/mail', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) }); await refresh(); onChange(); setMessage(enabled ? 'Mailbox connected. Use Sync now to check for estimates.' : 'Automatic email intake paused. Existing opportunities are retained.'); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  async function sync() {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await mailRequest<SyncResult>('/mail/sync', { method: 'POST' });
      await refresh(); onChange();
      setMessage(result.busy ? 'Another sync is running. Refresh shortly to see its results.' : result.paused ? 'Connect the mailbox to resume email intake.' : `${result.created} new opportunities · ${result.linked} linked to existing records · ${result.review} to review.${result.hasMore ? ' More messages are available. Select Continue sync.' : ''}`);
    } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  async function saveReview(data: ReturnType<typeof opportunityPayload>) {
    if (!reviewing) return;
    await mailRequest(`/mail/review/${reviewing.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    await refresh(); onChange(); setMessage('Reviewed estimate added to Opportunities.');
  }
  async function linkReview(row: ReviewMessage) {
    const target = linkTargets[row.id]; if (!target) return;
    setBusy(true); setError('');
    try { await mailRequest(`/mail/review/${row.id}/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ opportunityId: target }) }); await refresh(); onChange(); setMessage('Email linked. The existing opportunity is preserved.'); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  if (reviewing) return <OpportunityEditor item={null} initialValues={reviewing.parsedFields} properties={properties} statuses={statuses} onClose={() => setReviewing(null)} onSave={saveReview} onEdit={() => undefined} />;
  return <div className="modal-backdrop"><section className="property-modal opportunities-intake-dialog" role="dialog" aria-modal="true" aria-labelledby="opportunities-intake-title">
    <header className="opportunities-dialog-heading"><div><span>EMAIL INTAKE</span><h2 id="opportunities-intake-title">Microsoft 365</h2><p>Estimates received directly into Opportunities.</p></div><button type="button" disabled={busy} aria-label="Close email intake" onClick={onClose}><WorkspaceIcon name="close" /></button></header>
    <div className="opportunities-mail-account"><WorkspaceIcon name="mail" /><div><strong>{status?.mailbox || 'ximena.velosa@bluelifepools.com'}</strong><span>{loading ? 'Checking connection…' : status?.enabled ? status.automatic ? 'Connected · Automatic intake active' : 'Connected · Automatic schedule not verified yet' : 'Email intake paused'}</span></div></div>
    <dl className="opportunities-mail-details"><div><dt>Last checked</dt><dd>{when(status?.lastSyncAt)}</dd></div><div><dt>Last automatic check</dt><dd>{when(status?.lastScheduledSyncAt)}</dd></div><div><dt>Schedule</dt><dd>{status?.schedule || 'Every 15 minutes'}</dd></div></dl>
    <div className="opportunities-mail-counts"><div><strong>{status?.imported || 0}</strong><span>New from email</span></div><div><strong>{status?.linked || 0}</strong><span>Linked to existing</span></div><div><strong>{status?.review || 0}</strong><span>Need review</span></div></div>
    <p>The created date is the email received date. Existing estimates and your edits are preserved. Replies and invoices are excluded from new opportunities.</p>
    {(!status?.configured && !loading) && <p className="opportunities-message" role="status">Microsoft 365 credentials must be configured on the server before connecting.</p>}
    {(error || status?.lastError) && <p className="opportunities-message opportunities-error" role="alert">{error || status?.lastError}</p>}
    {message && <p className="opportunities-message" role="status">{message}</p>}
    {reviews.length > 0 && <details className="opportunities-mail-reviews"><summary>Messages to review ({status?.review || reviews.length})</summary><p>Confirm the information before adding or linking a record.</p>{reviews.map(row => <div key={row.id}><div><strong>{row.subject}</strong><span>{when(row.receivedAt)}</span><p>{row.reason}</p>{!!row.candidates?.length && <select aria-label={`Existing opportunity for ${row.subject}`} value={linkTargets[row.id] || ''} onChange={event => setLinkTargets({ ...linkTargets, [row.id]: event.target.value })}><option value="">Select an existing record…</option>{row.candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.propertyName} · {candidate.status || 'Not recorded'} · {currency(candidate.estimateAmount)} · {dateOnly(candidate.creationDate)}</option>)}</select>}</div>{row.candidates?.length ? <button type="button" className="opportunities-text-action" disabled={busy || !linkTargets[row.id]} onClick={() => void linkReview(row)}>Link email</button> : <button type="button" className="opportunities-text-action" disabled={busy} onClick={() => setReviewing(row)}>Review</button>}</div>)}{(status?.review || 0) > reviews.length && <p>Showing the 50 most recent messages. More appear as these are reviewed.</p>}</details>}
    <footer className="opportunities-dialog-actions"><button type="button" className="opportunities-text-action" disabled={busy || loading || !status?.configured} onClick={() => void enable(!status?.enabled)}>{status?.enabled ? 'Pause intake' : 'Connect mailbox'}</button><button type="button" className="opportunities-button opportunities-button-secondary" disabled={busy} onClick={onClose}>Close</button><button type="button" className="opportunities-button opportunities-button-primary" disabled={busy || loading || !status?.enabled || !status?.configured} onClick={() => void sync()}><WorkspaceIcon name="refresh" />{busy ? 'Checking…' : status?.hasMore ? 'Continue sync' : 'Sync now'}</button></footer>
  </section></div>;
}
