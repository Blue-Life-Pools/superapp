import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { currency, dateOnly, opportunityText, type Opportunity } from './opportunityFields';
import { WorkspaceIcon } from './WorkspaceIcon';

type InvoiceCandidate = Pick<Opportunity, 'id' | 'propertyName' | 'name' | 'estimateNumber' | 'estimateAmount' | 'actualRepairDate' | 'invoiceDate' | 'invoiceAmount'>;
type OpportunityRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

export function OpportunityInvoices({ request, canRecord, onRecorded }: { request: OpportunityRequest; canRecord: boolean; onRecorded?: () => void }) {
  const [items, setItems] = useState<InvoiceCandidate[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void request<InvoiceCandidate[]>('/pending-invoices', { signal: controller.signal })
      .then(data => {
        if (controller.signal.aborted) return;
        setItems(data);
        setSelected(id => data.some(item => item.id === id) ? id : '');
      })
      .catch((failure: Error) => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [request, version]);

  async function record(event: FormEvent<HTMLFormElement>, item: InvoiceCandidate) {
    event.preventDefault();
    if (!canRecord || saving) return;
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await request(`/${encodeURIComponent(item.id)}/invoice`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      setItems(previous => previous.filter(row => row.id !== item.id));
      setSelected('');
      setMessage(`Invoice recorded for ${item.propertyName}.`);
      onRecorded?.();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return <section className="opportunities-table-section" aria-labelledby="invoice-queue-title">
    <div className="opportunities-table-heading">
      <div><h2 id="invoice-queue-title">Ready to invoice</h2>{!loading && !error && <span>{items.length.toLocaleString()} pending</span>}</div>
      <button type="button" className="opportunities-icon-action" aria-label="Refresh pending invoices" disabled={loading || saving}
        onClick={() => setVersion(current => current + 1)}><WorkspaceIcon name="refresh" /></button>
    </div>
    {error && <p className="opportunities-message opportunities-error" role="alert">{error}</p>}
    {message && <p className="opportunities-message" role="status">{message}</p>}
    <div className="opportunities-table-wrap" role="region" aria-label="Pending invoices" tabIndex={0} aria-busy={loading}>
      <table className="opportunities-table opportunity-invoice-table">
        <thead><tr><th scope="col">Property</th><th scope="col">Work completed</th><th scope="col">Estimate</th><th scope="col">Amount</th><th scope="col">Repair date</th>{canRecord && <th scope="col">Invoice</th>}</tr></thead>
        <tbody>
          {items.map(item => <Fragment key={item.id}>
            <tr>
              <td><strong>{item.propertyName}</strong></td>
              <td className="opportunity-invoice-work">{opportunityText(item.name) || '—'}</td>
              <td>{item.estimateNumber || '—'}</td>
              <td>{currency(item.estimateAmount)}</td>
              <td>{dateOnly(item.actualRepairDate)}</td>
              {canRecord && <td><button type="button" className="opportunities-text-action" disabled={saving || loading}
                aria-expanded={selected === item.id} onClick={() => setSelected(selected === item.id ? '' : item.id)}>Record invoice</button></td>}
            </tr>
            {canRecord && selected === item.id && <tr><td colSpan={6}>
              <form className="opportunity-invoice-form" onSubmit={event => void record(event, item)}>
                <label>Invoice number<input name="invoiceNumber" maxLength={100} required /></label>
                <label>Invoice amount<input name="invoiceAmount" type="text" inputMode="decimal" pattern="[0-9]{1,12}(\.[0-9]{1,2})?" defaultValue={item.invoiceAmount ?? ''} required /></label>
                <label>Invoice date<input name="invoiceDate" type="date" defaultValue={item.invoiceDate?.slice(0, 10) ?? ''} required /></label>
                <button type="submit" className="opportunities-button opportunities-button-primary" disabled={saving || loading}>{saving ? 'Saving…' : 'Save invoice'}</button>
              </form>
            </td></tr>}
          </Fragment>)}
          {!items.length && <tr><td colSpan={canRecord ? 6 : 5} className="opportunities-empty">
            {loading ? 'Loading pending invoices…' : error ? 'Pending invoices are unavailable.' : 'No work is ready to invoice.'}
          </td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}
