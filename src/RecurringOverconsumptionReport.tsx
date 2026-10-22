import { useEffect, useState } from 'react';
import type { Dashboard } from './ChemicalConsumptionPanel';
import { API_URL, apiFetch } from './api';
import { englishChemicalName } from './chemicalConsumptionAlerts';

const quantity = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 4 });
type FollowUp = { id: string; authorName: string; body: string; tags: string[]; occurredAt: string };

export function RecurringOverconsumptionReport({ items }: { items: NonNullable<Dashboard['recurringOverconsumption']> }) {
  const [selectedId, setSelectedId] = useState('');
  const [comments, setComments] = useState<FollowUp[]>([]);
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [solveMode, setSolveMode] = useState(false);
  const [solution, setSolution] = useState('');
  const selected = items.find((item) => item.propertyId === selectedId);

  useEffect(() => {
    if (!selectedId) { setComments([]); return; }
    let cancelled = false;
    void apiFetch(`${API_URL}/chemicals/consumption/${selectedId}/follow-up`).then(async (response) => {
      if (!response.ok) throw new Error('No fue posible cargar el histórico.');
      const data = await response.json() as FollowUp[];
      if (!cancelled) setComments(data);
    }).catch((cause) => { if (!cancelled) setError((cause as Error).message); });
    return () => { cancelled = true; };
  }, [selectedId]);

  async function addComment() {
    if (!selectedId || !body.trim()) return;
    setBusy(true); setError('');
    try {
      const response = await apiFetch(`${API_URL}/chemicals/consumption/${selectedId}/follow-up`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body, occurredAt, tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean) }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message || 'No fue posible guardar la anotación.');
      setComments((current) => [data as FollowUp, ...current]); setBody(''); setTags('');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function solveProperty() {
    if (!selectedId || !solution.trim()) return;
    setBusy(true); setError('');
    try {
      const response = await apiFetch(`${API_URL}/chemicals/consumption/${selectedId}/follow-up/solve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ solution }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message || 'No fue posible resolver el seguimiento.');
      setComments((current) => [data as FollowUp, ...current]); setSolution(''); setSolveMode(false);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  if (!items.length) return null;
  return <section className="consumption-panel consumption-recurring" aria-labelledby="recurring-overconsumption-heading">
    <h2 id="recurring-overconsumption-heading">Properties with overconsumption for more than one month</h2>
    <div className="consumption-recurring-list">{items.map((item) => <div className={`consumption-recurring-row${item.resolved ? ' consumption-recurring-row-resolved' : ''}`} key={item.propertyId}><button type="button" className={item.propertyId === selectedId ? 'active' : ''} aria-expanded={item.propertyId === selectedId} onClick={() => { setSelectedId((current) => current === item.propertyId ? '' : item.propertyId); setSolveMode(false); }}><strong>{item.propertyName}</strong><span>{item.months} months in alert <b className="consumption-follow-up-count">▤ {item.propertyId === selectedId ? comments.length : item.followUpCount || 0}</b></span></button><button type="button" className="consumption-solve-button" title={item.resolved ? 'Resolved' : 'Mark as solved'} onClick={() => { setSelectedId(item.propertyId); setSolveMode(true); }}>✓ {item.resolved ? 'Solved' : 'Solve'}</button></div>)}</div>
    {selected && <div className="consumption-recurring-details"><strong>{selected.propertyName}</strong>{selected.entries.map((entry) => <p key={`${entry.month}-${entry.chemicalName}-${entry.unit}`}><b>{entry.month}</b> · {englishChemicalName(entry.chemicalName)}: {quantity(entry.quantity)} {entry.unit} · threshold {quantity(entry.threshold)} {entry.unit} · +{entry.excessPercent.toFixed(1)}%</p>)}
      <div className="consumption-follow-up"><div className="consumption-follow-up-heading"><h3>Follow-up history</h3><span>{comments.length} comments</span></div>{solveMode && <div className="consumption-solve-form"><strong>Solution / closing note</strong><textarea aria-label="Solution" placeholder="Describe the solution and why this property no longer needs review…" value={solution} disabled={busy} onChange={(event) => setSolution(event.target.value)} /><div><button type="button" className="primary-button" disabled={busy || !solution.trim()} onClick={() => void solveProperty()}>Confirm solve</button><button type="button" className="secondary-button" disabled={busy} onClick={() => { setSolveMode(false); setSolution(''); }}>Cancel</button></div></div>}<div className="consumption-follow-up-form"><textarea aria-label="Follow-up comment" placeholder="Meeting notes or next action…" value={body} disabled={busy} onChange={(event) => setBody(event.target.value)} /><div><input type="date" aria-label="Meeting date" value={occurredAt} disabled={busy} onChange={(event) => setOccurredAt(event.target.value)} /><input aria-label="Tags" placeholder="Tags, separated by commas" value={tags} disabled={busy} onChange={(event) => setTags(event.target.value)} /><button type="button" className="primary-button" disabled={busy || !body.trim()} onClick={() => void addComment()}>Add note</button></div></div>{error && <p className="consumption-error">{error}</p>}{comments.length === 0 && !error ? <p className="consumption-muted">No follow-up notes yet.</p> : <div className="consumption-follow-up-list">{comments.map((comment) => <article key={comment.id}><header><strong>{comment.authorName}</strong><time dateTime={comment.occurredAt}>{new Date(comment.occurredAt).toLocaleDateString()}</time></header><p>{comment.body}</p>{comment.tags.length > 0 && <div className="consumption-follow-up-tags">{comment.tags.map((tag) => <span key={tag}>@{tag}</span>)}</div>}</article>)}</div>}</div>
    </div>}
  </section>;
}
