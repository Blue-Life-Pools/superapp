import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { API_URL, apiFetch as fetch } from './api';

type Property = { id: string; name: string };
type Complaint = { id: string; propertyId: string; complaint: string; createdAt: string; requiresEstimate: boolean; estimateDescription?: string | null; typeOfCall: 'CALL' | 'COMPLAINT'; status: string; reminderAt?: string | null; property: Property };

const BOGOTA_TIME_ZONE = 'America/Bogota';
function bogotaInputValue(value?: string | null) {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: BOGOTA_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(value));
  const fields = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour === '24' ? '00' : fields.hour}:${fields.minute}`;
}
function bogotaIsoValue(value: string) { return value ? new Date(`${value}:00-05:00`).toISOString() : null; }
function displayStatus(status: string) { return ({ OPEN: 'Open', IN_PROGRESS: 'In Progress', RESOLVED: 'Resolved' } as Record<string, string>)[status] || status; }

export function ComplaintsPage({ sidebar, properties }: { sidebar: ReactNode; properties: Property[] }) {
  const [items, setItems] = useState<Complaint[]>([]);
  const [editing, setEditing] = useState<Complaint | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [estimateFilter, setEstimateFilter] = useState('ALL');

  async function load() {
    const response = await fetch(`${API_URL}/complaints`);
    if (!response.ok) throw new Error('Could not load complaints.');
    setItems(await response.json() as Complaint[]);
  }
  useEffect(() => { void load().catch((error: Error) => setMessage(error.message)); }, []);
  const filteredItems = items.filter((item) => (statusFilter === 'ALL' || item.status === statusFilter) && (estimateFilter === 'ALL' || (estimateFilter === 'REQUIRED' ? item.requiresEstimate : !item.requiresEstimate)));

  function newComplaint() {
    setEditing({ id: '', propertyId: '', complaint: '', createdAt: new Date().toISOString(), requiresEstimate: false, estimateDescription: '', typeOfCall: 'CALL', status: 'OPEN', reminderAt: null, property: { id: '', name: '' } });
    setMessage('');
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing || busy) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${API_URL}/complaints${editing.id ? `/${editing.id}` : ''}`, {
        method: editing.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: editing.propertyId, complaint: editing.complaint, createdAt: editing.createdAt, requiresEstimate: editing.requiresEstimate, estimateDescription: editing.requiresEstimate ? editing.estimateDescription : '', typeOfCall: editing.typeOfCall, status: editing.status, reminderAt: editing.reminderAt || null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Could not save complaint.');
      setItems((current) => editing.id ? current.map((item) => item.id === editing.id ? data : item) : [data, ...current]);
      setEditing(null); setMessage('Complaint saved.');
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function remove(item: Complaint) {
    if (!window.confirm('Delete this call?')) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${API_URL}/complaints/${item.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Could not delete call.');
      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      setMessage('Call deleted.');
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }

  const reminderItems = items.filter((item) => item.reminderAt && item.status !== 'RESOLVED').sort((a, b) => new Date(a.reminderAt || 0).getTime() - new Date(b.reminderAt || 0).getTime());
  const reminderSignal = (value: string) => { const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86400000); return days <= 0 ? 'red' : days <= 3 ? 'yellow' : 'green'; };
  return <div className="page app-page complaints-page">{sidebar}
    <header className="area-page-header complaints-header"><div><span className="area-eyebrow">CUSTOMER SERVICE</span><h1>Calls</h1><p>Telephone calls associated with each property.</p></div><button className="primary-button complaints-new-button" onClick={newComplaint}>+ New call</button></header>
    {message && <p role="status" className="health-sync-message complaints-message">{message}</p>}
    <div className="calls-main-grid"><section className="health-card complaints-card"><div className="health-card-heading"><div><h2>Calls inbox</h2><p>{items.length} recorded call{items.length === 1 ? '' : 's'}.</p></div><div className="complaint-filters"><select aria-label="Filter calls by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">All statuses</option><option value="OPEN">Open</option><option value="IN_PROGRESS">In Progress</option><option value="RESOLVED">Resolved</option></select><select aria-label="Filter calls by estimate" value={estimateFilter} onChange={(event) => setEstimateFilter(event.target.value)}><option value="ALL">All estimates</option><option value="REQUIRED">Estimate required</option><option value="NOT_REQUIRED">No estimate</option></select></div></div>
      {filteredItems.length === 0 ? <p className="health-empty">{items.length === 0 ? 'No calls recorded.' : 'No calls match the selected filters.'}</p> : <div className="complaint-list">{filteredItems.map((item) => <article className="complaint-item" key={item.id}><div className="complaint-content"><span className="health-ticket-id">{new Date(item.createdAt).toLocaleDateString('en-US')}</span><h3>{item.property?.name || 'Property unavailable'}</h3><div className="complaint-status-row"><span className={`health-status health-status-${item.status.toLowerCase().replace('_', '-')}`}>{displayStatus(item.status)}</span>{item.requiresEstimate && <span className="health-summary-estimate-status">Estimate</span>}</div><p>{item.complaint}</p></div><div className="complaint-meta"><div className="complaint-action-row"><button className="health-estimate-action" disabled={busy} onClick={() => setEditing({ ...item })}>Edit</button><button className="complaint-delete-button" disabled={busy} onClick={() => void remove(item)}>Delete</button></div></div></article>)}</div>}
    </section><aside className="health-card calls-upcoming"><div className="health-card-heading"><div><h2>Upcoming reminders</h2><p>Follow-up dates for calls.</p></div></div><div className="calls-signal-legend"><span><i className="calls-signal-dot calls-signal-red" />Due or overdue</span><span><i className="calls-signal-dot calls-signal-yellow" />Within 3 days</span><span><i className="calls-signal-dot calls-signal-green" />Later</span></div>{reminderItems.length === 0 ? <p className="health-empty">No upcoming reminders.</p> : reminderItems.map((item) => { const signal = reminderSignal(item.reminderAt!); return <button type="button" key={item.id} className={`calls-reminder-row calls-reminder-${signal}`} onClick={() => setEditing({ ...item })}><i className={`calls-signal-dot calls-signal-${signal}`} /><span><strong>{item.property?.name || 'Property unavailable'}</strong><small>{new Date(item.reminderAt!).toLocaleString('en-US', { timeZone: BOGOTA_TIME_ZONE })}</small><em>{displayStatus(item.status)}</em></span></button>; })}</aside></div>
    {editing && <div className="modal-backdrop"><section role="dialog" aria-modal="true" className="property-modal complaint-editor-modal"><div className="edit-panel-header"><h2>{editing.id ? 'Edit call' : 'New call'}</h2><button className="modal-close" onClick={() => setEditing(null)} aria-label="Close">&times;</button></div><form onSubmit={(event) => void save(event)} className="complaint-form"><label>Property<select required value={editing.propertyId} onChange={(event) => setEditing({ ...editing, propertyId: event.target.value })}><option value="">Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label><label>Creation date<input type="datetime-local" required value={bogotaInputValue(editing.createdAt)} onChange={(event) => setEditing({ ...editing, createdAt: bogotaIsoValue(event.target.value) || editing.createdAt })} /></label><label>Type of call<select value={editing.typeOfCall || 'CALL'} onChange={(event) => setEditing({ ...editing, typeOfCall: event.target.value as Complaint['typeOfCall'] })}><option value="CALL">Call</option><option value="COMPLAINT">Complaint</option></select></label><label className="complaint-wide">Call details<textarea required minLength={1} maxLength={20000} rows={10} placeholder="Write the call details as precisely and extensively as necessary" value={editing.complaint} onChange={(event) => setEditing({ ...editing, complaint: event.target.value })} /></label><div className="complaint-estimate-stack"><label className="complaint-check"><input type="checkbox" checked={editing.requiresEstimate} onChange={(event) => setEditing({ ...editing, requiresEstimate: event.target.checked, estimateDescription: event.target.checked ? (editing.estimateDescription || '') : '' })} /> Requires estimate</label>{editing.requiresEstimate && <label className="complaint-estimate-field">Estimate required<textarea required minLength={1} maxLength={20000} rows={5} placeholder="Describe the estimate required" value={editing.estimateDescription || ''} onChange={(event) => setEditing({ ...editing, estimateDescription: event.target.value })} /></label>}</div><div className="complaint-status-stack"><label className="complaint-status-field">Status<select value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value })}><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option></select></label><label className="complaint-reminder-field">Reminder date<input type="datetime-local" value={bogotaInputValue(editing.reminderAt)} onChange={(event) => setEditing({ ...editing, reminderAt: bogotaIsoValue(event.target.value) })} /></label></div><div className="modal-actions complaint-wide"><button type="button" className="secondary-button" onClick={() => setEditing(null)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving...' : 'Save call'}</button></div></form></section></div>}
  </div>;
}
