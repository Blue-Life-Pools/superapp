import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { API_URL, apiFetch as fetch } from './api';

type Property = { id: string; name: string };
type Complaint = { id: string; propertyId: string; complaint: string; createdAt: string; requiresEstimate: boolean; status: string; property: Property };

export function ComplaintsPage({ sidebar, properties }: { sidebar: ReactNode; properties: Property[] }) {
  const [items, setItems] = useState<Complaint[]>([]);
  const [editing, setEditing] = useState<Complaint | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch(`${API_URL}/complaints`);
    if (!response.ok) throw new Error('Could not load complaints.');
    setItems(await response.json() as Complaint[]);
  }
  useEffect(() => { void load().catch((error: Error) => setMessage(error.message)); }, []);

  function newComplaint() {
    setEditing({ id: '', propertyId: '', complaint: '', createdAt: new Date().toISOString(), requiresEstimate: false, status: 'OPEN', property: { id: '', name: '' } });
    setMessage('');
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing || busy) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`${API_URL}/complaints${editing.id ? `/${editing.id}` : ''}`, {
        method: editing.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: editing.propertyId, complaint: editing.complaint, createdAt: editing.createdAt, requiresEstimate: editing.requiresEstimate, status: editing.status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Could not save complaint.');
      setItems((current) => editing.id ? current.map((item) => item.id === editing.id ? data : item) : [data, ...current]);
      setEditing(null); setMessage('Complaint saved.');
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }

  return <div className="page app-page complaints-page">{sidebar}
    <header className="area-page-header complaints-header"><div><span className="area-eyebrow">CUSTOMER SERVICE</span><h1>Complaints</h1><p>Telephone complaints associated with each property.</p></div><button className="primary-button" onClick={newComplaint}>+ New complaint</button></header>
    {message && <p role="status" className="health-sync-message">{message}</p>}
    <section className="health-card complaints-card"><div className="health-card-heading"><div><h2>Complaint inbox</h2><p>{items.length} recorded complaint{items.length === 1 ? '' : 's'}.</p></div></div>
      {items.length === 0 ? <p className="health-empty">No complaints recorded.</p> : <div className="complaint-list">{items.map((item) => <article className="complaint-item" key={item.id}><div><span className="health-ticket-id">{new Date(item.createdAt).toLocaleDateString('en-US')}</span><h3>{item.property?.name || 'Property unavailable'}</h3><p>{item.complaint}</p></div><div className="complaint-meta"><span className={`health-status health-status-${item.status.toLowerCase().replace('_', '-')}`}>{item.status.replace('_', ' ')}</span>{item.requiresEstimate && <span className="health-summary-estimate-status">Requires estimate</span>}<button className="health-estimate-action" onClick={() => setEditing({ ...item })}>Edit</button></div></article>)}</div>}
    </section>
    {editing && <div className="modal-backdrop"><section role="dialog" aria-modal="true" className="property-modal complaint-editor-modal"><div className="edit-panel-header"><h2>{editing.id ? 'Edit complaint' : 'New complaint'}</h2><button className="modal-close" onClick={() => setEditing(null)} aria-label="Close">&times;</button></div><form onSubmit={(event) => void save(event)} className="complaint-form"><label>Property<select required value={editing.propertyId} onChange={(event) => setEditing({ ...editing, propertyId: event.target.value })}><option value="">Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label><label>Creation date<input type="datetime-local" required value={editing.createdAt.slice(0, 16)} onChange={(event) => setEditing({ ...editing, createdAt: new Date(event.target.value).toISOString() })} /></label><label className="complaint-wide">Complaint details<textarea required minLength={1} maxLength={20000} rows={10} placeholder="Write the complaint as precisely and extensively as necessary" value={editing.complaint} onChange={(event) => setEditing({ ...editing, complaint: event.target.value })} /></label><label className="complaint-check"><input type="checkbox" checked={editing.requiresEstimate} onChange={(event) => setEditing({ ...editing, requiresEstimate: event.target.checked })} /> Requires estimate</label><label>Status<select value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value })}><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option></select></label><div className="modal-actions complaint-wide"><button type="button" className="secondary-button" onClick={() => setEditing(null)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving...' : 'Save complaint'}</button></div></form></section></div>}
  </div>;
}
