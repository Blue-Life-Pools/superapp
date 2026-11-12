import { SearchField } from './SearchField';
import { WorkspaceIcon } from './WorkspaceIcon';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { API_URL, apiFetch as fetch, getAppToken } from './api';
import { daysUntilInspection, englishChemical, englishHealthStatus, estimateStatusOptions, healthDate, inspectionAlertDate, inspectionSignal } from './healthDisplay';

type Comment = { id: string; author: string; body: string; createdAt: string };
type Ticket = { id: string; name: string; subject: string; property: string; sender: string; receivedAt: string; visitDate: string; status: string; estimate: string; estimateNumber: string; healthData: Record<string, string>; comments: Comment[] };
const groups: Array<[string, string, string[]]> = [
  ['Quimico', 'Chemical', ['pH', 'Chlorine', 'Stabilizer']],
  ['Feeders', 'Feeders', ['Ph Feeder', 'Chlorine Feeder', 'Disinfection Feeder']],
  ['Main drain', 'Main drain', ['Main drain']],
  ['Flow meter /  Flow rate', 'Flow meter / Flow rate', ['Flow meter', 'Flow rate']],
  ['Life Hook, safety line', 'Safety line', ['Life Hook', 'Safety Line', 'Throw Rope', 'Life ring']],
  ['Gauges, gutters, Plugs', 'Gauges / Gutters / Plugs', ['Vacuum gauge', 'Skimmer gutter', 'Return', 'Plug', 'Gutter grate', 'Thermometer', 'pressure gauge']],
  ['Rules / Water level', 'Rules / Water level', ['Rules', 'Water level', 'water clarity']],
  ['Step / Handrail', 'Step / Handrail', ['Step', 'Handrail']],
  ['ORP', 'ORP', ['ORP']],
  ['Tile', 'Tile', ['Tile']],
  ['Filters', 'Filters', ['Filters']],
];
const dateValue = healthDate;
function asList(value: string) {
  try { const result: unknown = JSON.parse(value || '[]'); return Array.isArray(result) ? result.map(String) : value ? [value] : []; }
  catch { return value ? [value] : []; }
}
function mapTicket(row: Record<string, any>, commercialPropertyNames?: Set<string>): Ticket {
  const data = { ...(row.healthData ?? {}) };
  for (const field of ['Estado Estimado', 'Estado', 'Estado Final']) {
    if (typeof data[field] === 'string') data[field] = englishHealthStatus(data[field]);
  }
  if (typeof data.Quimico === 'string') data.Quimico = JSON.stringify(asList(data.Quimico).map(englishChemical));
  const assignedProperty = row.propertyName && (!commercialPropertyNames || commercialPropertyNames.has(row.propertyName)) ? row.propertyName : '';
  const subject = row.subject || 'Health Department request';
  const name = data['Ticket name']?.trim() || data.Propiedad?.trim() || subject.replace(/^Health Department inspection\s*-\s*/i, '').trim() || 'Health Department inspection';
  return { id: row.ticketNumber, name, subject, property: assignedProperty, sender: row.senderEmail || 'Historical / manual', receivedAt: row.receivedAt, visitDate: dateValue(data['Fecha de Inicio'] || row.visitDate || ''), status: row.status || 'NEW', estimate: row.estimateStatus || 'PENDING', estimateNumber: row.estimateNumber || data.Estimado || '', healthData: data, comments: row.comments || [] };
}
const statusLabel = (value: string) => value === 'CLOSED' ? 'Closed' : value === 'IN_PROGRESS' ? 'In progress' : 'New';
const searchKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
function ticketTitle(ticket: Ticket) {
  return ticket.name;
}
const analyticsMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function analyticsDate(ticket: Ticket) {
  const value = ticket.visitDate || ticket.receivedAt;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function HealthLineChart({ values, comparison }: { values: number[]; comparison?: number[] }) {
  const all = [...values, ...(comparison || [])];
  const max = Math.max(1, ...all);
  const point = (value: number, index: number) => ({ x: (index / 11) * 100, y: 92 - (value / max) * 78 });
  const points = (series: number[]) => series.map((value, index) => { const item = point(value, index); return `${item.x},${item.y}`; }).join(' ');
  const pointLabels = (series: number[], labelClass: string, offset: number) => series.map((value, index) => { const item = point(value, index); const y = Math.max(7, item.y + offset); return <text key={`${labelClass}-${index}`} className={labelClass} x="0" y="0" transform={`translate(${item.x} ${y}) scale(.25 1)`} textAnchor="middle">{value}</text>; });
  return <svg className="health-analytics-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M0 92H100" className="health-chart-axis" />{comparison && <><polyline points={points(comparison)} className="health-chart-line health-chart-line-previous" />{pointLabels(comparison, 'health-chart-point-label-previous', -6)}</>}{<><polyline points={points(values)} className="health-chart-line health-chart-line-current" />{pointLabels(values, 'health-chart-point-label-current', -3)}</>}</svg>;
}
function HealthAnalytics({ tickets, activeInitialReportFilter, onInitialReportFilterChange }: { tickets: Ticket[]; activeInitialReportFilter: string; onInitialReportFilterChange: (value: string) => void }) {
  const [selectedOutcome, setSelectedOutcome] = useState('Closed');
  const monthTickets = analyticsMonths.map((_, month) => tickets.filter((ticket) => { const date = analyticsDate(ticket); return date?.getFullYear() === 2026 && date.getMonth() === month; }));
  const estimateStatuses = estimateStatusOptions.filter((status) => status !== 'Required' && status !== 'Rejected');
  const reportCounts = monthTickets.map((monthRows) => monthRows.length);
  const estimateCounts = estimateStatuses.map((status) => tickets.filter((ticket) => { const date = analyticsDate(ticket); return date?.getFullYear() === 2026 && ticket.healthData['Estado Estimado']?.trim() === status; }).length);
  const outcomeSeries = ['Closed', 'Satisfactory', 'Unsatisfactory'].map((outcome) => [2025, 2026].map((year) => analyticsMonths.map((_, month) => tickets.filter((ticket) => { const date = analyticsDate(ticket); return date?.getFullYear() === year && date.getMonth() === month && ticket.healthData.Estado?.trim() === outcome; }).length)));
  const propertyCounts = [...new Map(tickets.filter((ticket) => analyticsDate(ticket)?.getFullYear() === 2026).map((ticket) => [ticket.property || ticket.name, 1])).keys()].map((name) => ({ name, count: tickets.filter((ticket) => { const date = analyticsDate(ticket); return (ticket.property || ticket.name) === name && date?.getFullYear() === 2026; }).length })).sort((a, b) => b.count - a.count).slice(0, 10);
  const maxReport = Math.max(1, ...reportCounts);
  const maxEstimate = Math.max(1, ...estimateCounts);
  const selectedOutcomeIndex = ['Closed', 'Satisfactory', 'Unsatisfactory'].indexOf(selectedOutcome);
  const selectedOutcomeSeries = outcomeSeries[selectedOutcomeIndex] || outcomeSeries[0];
  const selectedOutcomeTotal = selectedOutcomeSeries[1].reduce((sum, value) => sum + value, 0);
  const toggleInitialReportFilter = (value: string) => onInitialReportFilterChange(activeInitialReportFilter === value ? 'ALL' : value);
  const kpis: Array<[string, number, string]> = [['Reports (2026)', monthTickets.reduce((sum, value) => sum + value.length, 0), 'ALL'], ['Closed (2026)', outcomeSeries[0][1].reduce((sum, value) => sum + value, 0), 'Closed'], ['Satisfactory (2026)', outcomeSeries[1][1].reduce((sum, value) => sum + value, 0), 'Satisfactory'], ['Unsatisfactory (2026)', outcomeSeries[2][1].reduce((sum, value) => sum + value, 0), 'Unsatisfactory']];
  return <section className="health-analytics" aria-label="Inspection analytics">
    <div className="health-analytics-heading"><div><h2>Inspection Analytics</h2><p>Year-over-year compliance, inspection, and estimate performance.</p></div><span>2025 / 2026</span></div>
    <div className="health-analytics-kpis">{kpis.map(([label, value, filterValue]) => <button type="button" className={activeInitialReportFilter === filterValue ? 'is-active' : ''} aria-pressed={activeInitialReportFilter === filterValue} title={`Filter tickets by ${label}`} onClick={() => toggleInitialReportFilter(filterValue)} key={label}><b>{label}</b><strong>{value}</strong></button>)}</div>
    <div className="health-analytics-top-grid"><article className="health-analytics-card health-analytics-bars"><h3>Reports by month 2026</h3><p>Converted, sent, and approved estimate reports.</p><div className="health-bar-chart">{reportCounts.map((count, index) => <div className="health-bar-column" key={analyticsMonths[index]}><strong>{count}</strong><span style={{ height: `${Math.max(3, (count / maxReport) * 100)}%` }} /><small>{analyticsMonths[index]}</small></div>)}</div></article><article className="health-analytics-card health-analytics-bars"><h3>Estimate status 2026</h3><p>Estimate count by status.</p><div className="health-bar-chart health-bar-chart-estimates">{estimateStatuses.map((status, index) => <div className="health-bar-column" key={status}><strong>{estimateCounts[index]}</strong><span style={{ height: `${Math.max(3, (estimateCounts[index] / maxEstimate) * 100)}%` }} /><small>{status}</small></div>)}</div></article></div>
    <article className="health-analytics-card health-analytics-outcomes-card"><div className="health-outcomes-heading"><div><h3>Inspection outcomes</h3><p>Monthly trend with comparison by year.</p></div><div className="health-outcome-tabs" role="tablist" aria-label="Inspection outcome filter">{['Closed', 'Satisfactory', 'Unsatisfactory'].map((outcome) => <button type="button" role="tab" aria-selected={selectedOutcome === outcome} className={selectedOutcome === outcome ? 'is-active' : ''} onClick={() => setSelectedOutcome(outcome)} key={outcome}>{outcome}</button>)}</div></div><div className="health-outcomes-body"><aside className="health-outcome-summary"><span>Selected outcome</span><strong>{selectedOutcome}</strong><b>{selectedOutcomeTotal}</b><small>2026 total</small></aside><div className="health-outcome-chart"><div className="health-line-heading"><span><i className="health-chart-dot health-chart-dot-previous" />2025 <i className="health-chart-dot health-chart-dot-current" />2026</span></div><HealthLineChart values={selectedOutcomeSeries[1]} comparison={selectedOutcomeSeries[0]} /><div className="health-line-labels">{analyticsMonths.map((month) => <small key={month}>{month}</small>)}</div></div></div></article>
    <article className="health-analytics-card health-analytics-properties"><h3>Inspected properties 2026</h3>{propertyCounts.length === 0 && <p>No inspected properties in the selected data.</p>}{propertyCounts.map((item) => <div className="health-property-bar" key={item.name}><span title={item.name}>{item.name}</span><i style={{ width: `${Math.max(3, (item.count / Math.max(1, propertyCounts[0]?.count || 1)) * 100)}%` }} /><strong>{item.count}</strong></div>)}</article>
  </section>;
}
async function request(path: string, options?: RequestInit) {
  const response = await fetch(API_URL + path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.message === 'string' ? data.message : 'Unable to complete this action.');
  return data;
}

export function HealthDepartmentPage({ sidebar, properties, unassignedOnly = false, onClearUnassignedFilter }: { sidebar: ReactNode; properties: Array<{ id: string; name: string }>; unassignedOnly?: boolean; onClearUnassignedFilter?: () => void }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [analyticsTickets, setAnalyticsTickets] = useState<Ticket[]>([]);
  const [editing, setEditing] = useState<Ticket | null>(null);
  const [filter, setFilter] = useState('All');
  const [estimateFilter, setEstimateFilter] = useState('ALL');
  const [initialReportFilter, setInitialReportFilter] = useState('ALL');
  const [propertySearch, setPropertySearch] = useState('');
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [author, setAuthor] = useState('Health Department');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [assigningProperty, setAssigningProperty] = useState<string | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [deleting, setDeleting] = useState<Ticket | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [token, setToken] = useState(() => getAppToken() || sessionStorage.getItem('bluelife-health-admin-token') || localStorage.getItem('bluelife-chemicals-owner-token') || '');
  const load = useCallback(async (append = false) => { const offset = append ? tickets.length : 0; const result = await request(`/health-department/tickets?offset=${offset}&limit=25`); const rows = Array.isArray(result) ? result : Array.isArray(result.items) ? result.items : []; const commercialPropertyNames = new Set(properties.map((property) => property.name)); const next = rows.map((row: Record<string, any>) => mapTicket(row, commercialPropertyNames)); setTickets((current) => append ? [...current, ...next] : next); setHasMore(Array.isArray(result) ? false : Boolean(result.hasMore)); }, [properties, tickets.length]);
  const loadAnalytics = useCallback(async () => {
    const all: Ticket[] = [];
    const commercialPropertyNames = new Set(properties.map((property) => property.name));
    let offset = 0;
    while (true) {
      const result = await request(`/health-department/tickets?offset=${offset}&limit=50`);
      const rows = Array.isArray(result) ? result : Array.isArray(result.items) ? result.items : [];
      all.push(...rows.map((row: Record<string, any>) => mapTicket(row, commercialPropertyNames)));
      if (Array.isArray(result) || !result.hasMore || rows.length === 0) break;
      offset += rows.length;
    }
    setAnalyticsTickets(all);
  }, [properties]);
  useEffect(() => { void Promise.all([load(), loadAnalytics()]).catch((error: Error) => setMessage(error.message)); }, [properties]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const filterSource = analyticsTickets.length ? analyticsTickets : tickets;
  const estimateDetailOptions = useMemo(() => [...new Set([
    ...estimateStatusOptions,
    ...filterSource.map((ticket) => ticket.healthData['Estado Estimado']?.trim()).filter((value): value is string => Boolean(value)),
  ])], [filterSource]);
  const filterTickets = useCallback((source: Ticket[]) => {
    const query = searchKey(propertySearch);
    return source.filter((ticket) => {
      const estimateMatches = estimateFilter === 'ALL'
        || (estimateFilter === 'PENDING' && ticket.estimate === 'PENDING')
        || (estimateFilter === 'NOT_REQUIRED' && ticket.estimate === 'NOT_REQUIRED')
        || (estimateFilter === 'REQUIRED' && ticket.estimate === 'REQUIRED')
        || (estimateFilter.startsWith('STATUS:') && ticket.healthData['Estado Estimado']?.trim() === estimateFilter.slice(7));
      const initialMatches = initialReportFilter === 'ALL' || ticket.healthData.Estado?.trim() === initialReportFilter;
      return (filter === 'All' || ticket.status === filter) && estimateMatches && initialMatches && (!unassignedOnly || !ticket.property) && (!query || searchKey(ticket.property).includes(query) || searchKey(ticket.name).includes(query));
    });
  }, [filter, estimateFilter, initialReportFilter, propertySearch, unassignedOnly]);
  const filtered = useMemo(() => filterTickets(tickets), [tickets, filterTickets]);
  const analyticsFiltered = useMemo(() => filterTickets(analyticsTickets), [analyticsTickets, filterTickets]);
  const initialReportOptions = useMemo(() => [...new Set(['Satisfactory', 'Unsatisfactory', 'Closed', ...filterSource.map((ticket) => ticket.healthData.Estado?.trim()).filter((value): value is string => Boolean(value))])], [filterSource]);
  async function loadMore() { if (loadingMore || !hasMore) return; setLoadingMore(true); try { setMessage(''); await load(true); } catch (error) { setMessage((error as Error).message); } finally { setLoadingMore(false); } }
  const upcoming = useMemo(() => tickets.map((ticket) => ({ ticket, ...inspectionAlertDate(ticket) })).filter(({ ticket, date }) => ticket.status !== 'CLOSED' && date && daysUntilInspection(date, clock) >= 0).sort((a, b) => a.date.localeCompare(b.date)), [tickets, clock]);
  const urgent = upcoming.filter(({ date }) => daysUntilInspection(date, clock) <= 10);
  function newTicket() {
    setMessage('');
    setEditing({ id: '', name: '', subject: 'Health Department visit', property: '', sender: '', receivedAt: '', visitDate: '', status: 'NEW', estimate: 'NOT_REQUIRED', estimateNumber: '', healthData: {}, comments: [] });
  }
  function update(field: string, value: string) {
    setEditing((current) => current ? { ...current, healthData: { ...current.healthData, [field]: value } } : null);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!editing || busy) return;
    setBusy(true); setMessage('');
    try {
      const ticketName = editing.name.trim();
      const data = { ...editing.healthData, 'Ticket name': ticketName, Propiedad: editing.healthData.Propiedad?.trim() || editing.property, 'Fecha de Inicio': editing.visitDate, Estimado: editing.estimate === 'REQUIRED' ? editing.estimateNumber : '' };
      const row = await request('/health-department/tickets' + (editing.id ? '/' + encodeURIComponent(editing.id) : ''), {
        method: editing.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: ticketName, propertyName: editing.property, visitDate: editing.visitDate || null, status: editing.status, estimateStatus: editing.estimate, estimateNumber: editing.estimate === 'REQUIRED' ? editing.estimateNumber : '', healthData: data }),
      });
      const saved = mapTicket({ ...row, comments: editing.comments });
      setTickets((current) => editing.id ? current.map((ticket) => ticket.id === editing.id ? saved : ticket) : [saved, ...current]);
      setEditing(null); setMessage('Ticket saved.');
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function assignProperty(ticket: Ticket, propertyName: string) {
    if (assigningProperty) return;
    setAssigningProperty(ticket.id); setMessage('');
    try {
      const row = await request('/health-department/tickets/' + encodeURIComponent(ticket.id), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyName }),
      });
      const saved = mapTicket({ ...row, comments: ticket.comments });
      setTickets((current) => current.map((item) => item.id === ticket.id ? saved : item));
      setMessage(propertyName ? 'Property assigned.' : 'Property assignment removed.');
    } catch (error) { setMessage((error as Error).message); } finally { setAssigningProperty(null); }
  }
  async function sync() {
    setBusy(true); setMessage('');
    try { await request('/health-department/sync', { method: 'POST' }); await load(); setMessage('Sync completed.'); }
    catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function addComment(event: FormEvent, ticket: Ticket) {
    event.preventDefault(); if (!draft.trim() || busy) return;
    setBusy(true);
    try {
      const comment = await request('/health-department/tickets/' + encodeURIComponent(ticket.id) + '/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ author: author.trim(), body: draft.trim() }) });
      setTickets((current) => current.map((item) => item.id === ticket.id ? { ...item, comments: [...item.comments, comment] } : item)); setDraft('');
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  }
  async function remove(event: FormEvent) {
    event.preventDefault(); if (!deleting || busy) return;
    setBusy(true); setMessage('');
    try {
      let auth = token;
      if (!auth) {
        let result;
        try { result = await request('/health-department/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); }
        catch { result = await request('/chemicals/owner/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); }
        auth = result.token; setToken(auth); sessionStorage.setItem('bluelife-health-admin-token', auth); setPassword('');
      }
      await request('/health-department/tickets/' + encodeURIComponent(deleting.id), { method: 'DELETE', headers: { Authorization: 'Bearer ' + auth } });
      setTickets((current) => current.filter((ticket) => ticket.id !== deleting.id)); setDeleting(null); setMessage('Ticket deleted.');
    } catch (error) {
      setToken(''); sessionStorage.removeItem('bluelife-health-admin-token'); setMessage((error as Error).message);
    } finally { setBusy(false); }
  }
  function reportStatus(field: string, label: string) {
    return <label>{label}<select value={editing?.healthData[field] || ''} onChange={(event) => update(field, event.target.value)}><option value="">Select status</option>{['Closed', 'Satisfactory', 'Unsatisfactory'].map((value) => <option key={value}>{value}</option>)}</select></label>;
  }
  function summary(ticket: Ticket) {
    const data = ticket.healthData;
    const items = [
      ['Inspection', ticket.visitDate], ['Initial report', data.Estado], ['Reinspection deadline', data['Fecha Límite']], ['Violations', data.Violaciones],
      ...groups.map(([field, label]) => [label, asList(data[field]).join(', ')]),
      ['Requires estimate', ticket.estimate === 'REQUIRED' ? 'Yes' : 'No'],
      ['Estimate number', ticket.estimateNumber], ['Estimate status', data['Estado Estimado']], ['Final report', data['Estado Final']],
    ].filter(([, value]) => value);
    const summaryIcon = (label: string) => (label === 'Inspection' || label === 'Reinspection deadline' ? 'calendar' : label === 'Violations' ? 'warning' : label === 'Chemical' ? 'chemicals' : label === 'Flow meter / Flow rate' ? 'pool' : label === 'Requires estimate' ? 'layers' : label === 'Estimate number' || label === 'Estimate status' ? 'tag' : 'reports') as Parameters<typeof WorkspaceIcon>[0]['name'];
    const renderItem = ([label, value]: string[]) => <div className={'health-summary-chip' + (label === 'Estimate number' ? ' health-summary-estimate-number' : label === 'Estimate status' ? ' health-summary-estimate-status' : '')} key={label}><WorkspaceIcon name={summaryIcon(label)} /><span className="health-summary-copy"><b>{label}</b><strong>{value}</strong></span></div>;
    const moveSummary = (event: React.MouseEvent<HTMLButtonElement>, direction: number) => { const summary = event.currentTarget.parentElement?.querySelector('.health-ticket-summary'); summary?.scrollBy({ left: direction * 260, behavior: 'smooth' }); };
    return <div className="health-summary-carousel"><button type="button" className="health-summary-arrow" aria-label="Previous ticket details" onClick={(event) => moveSummary(event, -1)}>‹</button><div className="health-ticket-summary">{items.map(renderItem)}</div><button type="button" className="health-summary-arrow" aria-label="Next ticket details" onClick={(event) => moveSummary(event, 1)}>›</button></div>;
  }
  return <div className="page app-page health-page">{sidebar}
    <header className="area-page-header health-header"><div><span className="area-eyebrow">COMPLIANCE & SERVICE</span><h1>Health Department</h1></div><div className="health-header-actions"><button className="secondary-button" disabled={busy} onClick={() => void sync()}>Sync</button><button className="primary-button" onClick={newTicket}>+ New ticket</button></div></header>
    {message && <p role="status" className="health-sync-message">{message}</p>}
    {unassignedOnly && <div className="health-unassigned-banner"><span>Showing {filtered.length} tickets without a Commercial property assignment.</span><button type="button" onClick={onClearUnassignedFilter}>Show all tickets</button></div>}
    {urgent.length > 0 && <div className="health-alert-banner"><span className="health-alert-icon">!</span><div><strong>{urgent.length} reinspections within 10 days</strong><p>Based only on assigned reinspection deadlines.</p></div></div>}
    <HealthAnalytics tickets={analyticsFiltered} activeInitialReportFilter={initialReportFilter} onInitialReportFilterChange={setInitialReportFilter} />
    <div className="health-main-grid">
      <section className="health-card health-tickets-card"><div className="health-card-heading"><div><h2>Ticket inbox</h2><p>Inspection reports and follow-up.</p></div><div className="health-ticket-filters"><SearchField aria-label="Search by property name" placeholder="Search property" value={propertySearch} onChange={(event) => setPropertySearch(event.target.value)} /><select aria-label="Filter tickets" value={filter} onChange={(event) => setFilter(event.target.value)}><option>All</option><option value="NEW">New</option><option value="IN_PROGRESS">In progress</option><option value="CLOSED">Closed</option></select><select className="health-estimate-filter" aria-label="Filter by estimate status" value={estimateFilter} onChange={(event) => setEstimateFilter(event.target.value)}><option value="ALL">All estimates</option><option value="PENDING">Pending decision</option><option value="NOT_REQUIRED">Not required</option><option value="REQUIRED">Requires estimate</option>{estimateDetailOptions.map((status) => <option key={status} value={`STATUS:${status}`}>Estimate: {status}</option>)}</select><select className="health-report-filter" aria-label="Filter by initial report status" value={initialReportFilter} onChange={(event) => setInitialReportFilter(event.target.value)}><option value="ALL">All initial reports</option>{initialReportOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></div></div>
        <div className="health-ticket-list">{filtered.length === 0 && <p className="health-empty">No tickets to display.</p>}{filtered.map((ticket) => <article className="health-ticket" key={ticket.id}>
          <div className="health-ticket-top"><span className="health-ticket-icon" aria-hidden="true"><WorkspaceIcon name="reports" /></span><span className="health-ticket-id">{ticket.id}</span><span className={'health-status health-status-' + statusLabel(ticket.status).toLowerCase().replace(' ', '-')}>{statusLabel(ticket.status)}</span><span className="health-ticket-received"><WorkspaceIcon name="calendar" />Received {new Date(ticket.receivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
          <h3>{ticketTitle(ticket)}</h3>
          <label className="health-ticket-property-select"><span>Property</span><select aria-label={`Property for ${ticketTitle(ticket)}`} value={ticket.property} disabled={assigningProperty === ticket.id} onChange={(event) => void assignProperty(ticket, event.target.value)}><option value="">Select property</option>{ticket.property && !properties.some((property) => property.name === ticket.property) && <option>{ticket.property}</option>}{properties.map((property) => <option key={property.id} value={property.name}>{property.name}</option>)}</select>{assigningProperty === ticket.id && <small>Saving…</small>}</label>
          <div className="health-ticket-meta"><span>Received {new Date(ticket.receivedAt).toLocaleDateString('en-US')}</span></div>{summary(ticket)}
          <div className="health-ticket-actions"><button className="health-estimate-action" onClick={() => setEditing({ ...ticket, healthData: { ...ticket.healthData } })}>Edit ticket</button><button className="health-comments-button" onClick={() => { setOpenComments(openComments === ticket.id ? null : ticket.id); setDraft(''); }}>Comments ({ticket.comments.length})</button><button className="health-delete-button" onClick={() => { setMessage(''); setDeleting(ticket); }}>Delete ticket</button></div>
          {openComments === ticket.id && <div className="health-comments-panel"><div className="health-comments-list">{ticket.comments.map((comment) => <div className="health-comment" key={comment.id}><strong>{comment.author}</strong><small> {new Date(comment.createdAt).toLocaleString()}</small><p>{comment.body}</p></div>)}</div><form className="health-comment-form" onSubmit={(event) => void addComment(event, ticket)}><input aria-label="Comment author" required value={author} onChange={(event) => setAuthor(event.target.value)} /><textarea aria-label="Comment" required rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} /><button className="secondary-button" disabled={busy}>Add comment</button></form></div>}
        </article>)}{hasMore && <button className="secondary-button health-load-more" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Loading...' : 'Load more tickets'}</button>}</div>
      </section>
      <aside className="health-card health-upcoming">
        <div className="health-card-heading"><div><h2>Upcoming inspections</h2><p>Based only on assigned reinspection deadlines.</p></div></div>
        <div className="health-signal-legend" aria-label="Inspection priority legend"><span><i className="health-signal-dot health-signal-red" />0–2 days</span><span><i className="health-signal-dot health-signal-yellow" />3–5 days</span><span><i className="health-signal-dot health-signal-green" />6–10 days</span></div>
        {upcoming.length === 0 && <p className="health-empty">No upcoming reinspection deadlines assigned.</p>}
        {upcoming.map(({ ticket, date, label }) => {
          const days = daysUntilInspection(date, clock);
          const signal = inspectionSignal(days);
          return <button key={ticket.id} className={'health-upcoming-row health-inspection-' + signal} onClick={() => setEditing({ ...ticket, healthData: { ...ticket.healthData } })}>
            <span className="health-date-chip"><strong>{Number(date.slice(8))}</strong><small>{new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}</small></span>
            <span className="health-inspection-info"><strong>{ticket.property || 'Select property'}</strong><small>{ticket.id}</small><small>{label}: {date}</small><em className="health-inspection-countdown"><i className={'health-signal-dot health-signal-' + signal} />{days === 0 ? 'Today' : days + (days === 1 ? ' day remaining' : ' days remaining')}</em></span>
          </button>;
        })}
      </aside>
    </div>
    {editing && <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-label={editing.id ? 'Edit ticket' : 'New ticket'} className="property-modal repair-request-modal health-editor-modal"><div className="edit-panel-header"><h2>{editing.id ? 'Edit ' + editing.id : 'New ticket'}</h2><button className="modal-close" aria-label="Close editor" onClick={() => setEditing(null)}>&times;</button></div><form onSubmit={(event) => void save(event)}><div className="health-detail-grid health-form-grid">
      <label className="health-ticket-name-field">Ticket name<input required maxLength={200} placeholder="Example: Sole on Central" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label>
      <label>Property<select required value={editing.property} onChange={(event) => setEditing({ ...editing, property: event.target.value })}><option value="">Select property</option>{editing.property && !properties.some((property) => property.name === editing.property) && <option>{editing.property}</option>}{properties.map((property) => <option key={property.id} value={property.name}>{property.name}</option>)}</select></label>
      <label>Inspection date<input type="date" value={editing.visitDate} onChange={(event) => setEditing({ ...editing, visitDate: event.target.value })} /></label>
      <label>Ticket status<select value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value })}><option value="NEW">New</option><option value="IN_PROGRESS">In progress</option><option value="CLOSED">Closed</option></select></label>
      <div className="health-initial-column">{reportStatus('Estado', 'Initial report status')}<label>Reinspection deadline<input type="date" value={dateValue(editing.healthData['Fecha Límite'] || '')} onChange={(event) => update('Fecha Límite', event.target.value)} /></label></div>
      <label className="health-violations-field">Violations<textarea rows={5} value={editing.healthData.Violaciones || ''} onChange={(event) => update('Violaciones', event.target.value)} /></label>
<fieldset><legend>Requires estimate</legend><label className="health-option"><input type="checkbox" checked={editing.estimate === 'REQUIRED'} onChange={(event) => setEditing({ ...editing, estimate: event.target.checked ? 'REQUIRED' : 'NOT_REQUIRED' })} />Yes</label>{editing.estimate === 'REQUIRED' && <><label>Estimate number<input value={editing.estimateNumber} onChange={(event) => setEditing({ ...editing, estimateNumber: event.target.value })} /></label><label>Estimate status<select value={editing.healthData['Estado Estimado'] || ''} onChange={(event) => update('Estado Estimado', event.target.value)}><option value="">Select status</option>{[...estimateStatusOptions, ...(editing.healthData['Estado Estimado'] && !estimateStatusOptions.includes(editing.healthData['Estado Estimado']) ? [editing.healthData['Estado Estimado']] : [])].map((value) => <option key={value}>{value}</option>)}</select></label></>}</fieldset>
      {groups.map(([field, label, options]) => <fieldset key={field}><legend>{label}</legend>{options.map((option) => <label className="health-option" key={option}><input type="checkbox" checked={asList(editing.healthData[field]).includes(option)} onChange={(event) => { const list = asList(editing.healthData[field]); update(field, JSON.stringify(event.target.checked ? [...new Set([...list, option])] : list.filter((item) => item !== option))); }} />{option}</label>)}</fieldset>)}
      <div className="health-final-field">{reportStatus('Estado Final', 'Final report status')}</div>
    </div>{message && <p role="alert">{message}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setEditing(null)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving...' : 'Save ticket'}</button></div></form></section></div>}
    {deleting && <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-label="Delete ticket" className="property-modal health-delete-modal"><h2>Delete ticket</h2><p>Delete {deleting.property || deleting.id}? This ticket will be removed from the inbox.</p><form onSubmit={(event) => void remove(event)}>{!token && <><p>Sign in with your Chemicals administrator account or the Service account.</p><label>Email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label></>}{message && <p role="alert">{message}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { setDeleting(null); setPassword(''); }}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Please wait...' : 'Confirm deletion'}</button></div></form></section></div>}
  </div>;
}
