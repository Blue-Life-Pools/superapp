import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { API_URL, apiFetch as fetch } from './api';
import { daysUntilInspection, englishChemical, englishHealthStatus, healthDate, inspectionSignal } from './healthDisplay';
import { healthHistoryDate, indexPropertyHealthTickets, propertyNameKey, ticketInspectionDate } from './propertyHistory';
import type { PropertyHealthTicket } from './propertyHistory';

type HistoryProperty = {
  id: string; name: string; code: string | null; lifecycleStatus: string; serviceStartDate: string | null;
  propertyType: string | null; segment: string | null; addressLine1: string | null; city: string | null;
  state: string | null; zipCode: string | null; county: string | null; maintenanceChiefInfo: string | null;
  sharepointFolderUrl: string | null;
  managementCompany: { id: string; name: string } | null;
  contacts: Array<{ id: string; role: string | null; isPrimary: boolean; contact: { id: string; firstName: string | null; lastName: string | null; email: string | null; phone: string | null } }>;
  waterBodies: Array<{ id: string; name: string; type: string; size: string | null; gallons: number | null; active: boolean }>;
};
type GeneralInformationForm = {
  name: string;
  managementCompanyName: string;
  propertyType: string;
  segment: string;
  addressLine1: string;
  city: string;
  county: string;
  state: string;
  zipCode: string;
  maintenanceChiefInfo: string;
};
type ContactInformationForm = {
  contactId?: string;
  firstName: string;
  lastName: string;
  role: string;
  email: string;
  phone: string;
  isPrimary: boolean;
};
type WaterBodyInformationForm = {
  name: string;
  type: string;
  size: string;
  gallons: string;
  active: boolean;
};
type PropertyReport = {
  id: string; occurredAt: string; propertyId?: string | null; propertyName: string; importance: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string; requiresInspector: boolean; status: 'PENDING' | 'SOLVED'; resolution?: string | null;
  type: { name: string; color?: string }; technician: { name: string; color?: string }; supervisor: { name: string };
  inspector?: { name: string } | null; attachments?: Array<{ id: string; fileName: string; sharepointWebUrl: string }>;
};
type Tab = 'overview' | 'general' | 'reports' | 'health';
type AlertFilter = 'all' | 'reports' | 'health';
const tabs: Array<[Tab, string]> = [['overview', 'Overview'], ['general', 'General information'], ['reports', 'Reports'], ['health', 'Health Department']];
const checklistFields = [
  ['Quimico', 'Chemical'], ['Feeders', 'Feeders'], ['Main drain', 'Main drain'], ['Flow meter /  Flow rate', 'Flow meter / Flow rate'],
  ['Life Hook, safety line', 'Safety line'], ['Gauges, gutters, Plugs', 'Gauges / Gutters / Plugs'], ['Rules / Water level', 'Rules / Water level'], ['Step / Handrail', 'Step / Handrail'],
];
function label(value: string | null) { return value ? value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : 'Not assigned'; }
function ticketStatus(value: string) { return value === 'CLOSED' ? 'Closed' : value === 'IN_PROGRESS' ? 'In progress' : 'New'; }
function checklist(value: string, chemical: boolean) {
  let values = [value];
  try { const parsed: unknown = JSON.parse(value); if (Array.isArray(parsed)) values = parsed.map(String); } catch {}
  return values.map((item) => chemical ? englishChemical(item) : item).join(', ');
}
function info(title: string, value: string | null | undefined, accent = '') { return <div className={'history-info-item' + (accent ? ' ' + accent : '')} key={title}><dt>{title}</dt><dd>{value || 'Not assigned'}</dd></div>; }
function reportDate(value: string) { return new Date(value).toLocaleDateString('en-US', { timeZone: 'UTC' }); }
function reportStatus(value: PropertyReport['status']) { return value === 'SOLVED' ? 'Solved' : 'Pending'; }
function reportImportance(value: PropertyReport['importance']) { return value === 'HIGH' ? 'High' : value === 'LOW' ? 'Low' : 'Medium'; }
function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
function propertyWords(value: string) { return propertyNameKey(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean).map((word) => word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word); }
function propertyToGeneralInformation(property: HistoryProperty): GeneralInformationForm {
  return {
    name: property.name,
    managementCompanyName: property.managementCompany?.name || '',
    propertyType: property.propertyType || '',
    segment: property.segment || '',
    addressLine1: property.addressLine1 || '',
    city: property.city || '',
    county: property.county || '',
    state: property.state || '',
    zipCode: property.zipCode || '',
    maintenanceChiefInfo: property.maintenanceChiefInfo || '',
  };
}
function propertyToContactInformation(property: HistoryProperty): ContactInformationForm[] {
  return property.contacts.map((relation) => ({
    contactId: relation.contact.id,
    firstName: relation.contact.firstName || '',
    lastName: relation.contact.lastName || '',
    role: relation.role || '',
    email: relation.contact.email || '',
    phone: relation.contact.phone || '',
    isPrimary: relation.isPrimary,
  }));
}
function propertyToWaterBodyInformation(property: HistoryProperty): WaterBodyInformationForm[] {
  return property.waterBodies.map((body) => ({
    name: body.name,
    type: body.type,
    size: body.size || '',
    gallons: body.gallons == null ? '' : String(body.gallons),
    active: body.active,
  }));
}

export function PropertyHistoryPage({ sidebar, properties, canEdit, onOpenHealth, onNewProperty, onPropertyUpdated }: { sidebar: ReactNode; properties: HistoryProperty[]; canEdit: boolean; onOpenHealth?: () => void; onNewProperty: () => void; onPropertyUpdated: (property: HistoryProperty) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [search, setSearch] = useState('');
  const [alertFilter, setAlertFilter] = useState<AlertFilter>('all');
  const [tickets, setTickets] = useState<PropertyHealthTicket[]>([]);
  const [reports, setReports] = useState<PropertyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [clock, setClock] = useState(() => new Date());
  const [editingGeneral, setEditingGeneral] = useState(false);
  const [generalForm, setGeneralForm] = useState<GeneralInformationForm | null>(null);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [creatingSharePointFolder, setCreatingSharePointFolder] = useState(false);
  const [sharePointUrlDraft, setSharePointUrlDraft] = useState('');
  const [savingSharePointUrl, setSavingSharePointUrl] = useState(false);
  const [generalMessage, setGeneralMessage] = useState('');
  const [editingContacts, setEditingContacts] = useState(false);
  const [contactForms, setContactForms] = useState<ContactInformationForm[]>([]);
  const [savingContacts, setSavingContacts] = useState(false);
  const [contactsMessage, setContactsMessage] = useState('');
  const [editingWaterBodies, setEditingWaterBodies] = useState(false);
  const [waterBodyForms, setWaterBodyForms] = useState<WaterBodyInformationForm[]>([]);
  const [savingWaterBodies, setSavingWaterBodies] = useState(false);
  const [waterBodiesMessage, setWaterBodiesMessage] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function load() {
      if (pending) return;
      pending = true;
      try {
        const [healthResponse, reportsResponse] = await Promise.all([
          fetch(API_URL + '/health-department/tickets', { signal: controller.signal }),
          fetch(API_URL + '/reports', { signal: controller.signal }),
        ]);
        if (!healthResponse.ok || !reportsResponse.ok) throw new Error('Unable to load the property history.');
        const healthRows: unknown = await healthResponse.json();
        const reportsDashboard: unknown = await reportsResponse.json();
        if (!Array.isArray(healthRows) || !reportsDashboard || typeof reportsDashboard !== 'object' || !Array.isArray((reportsDashboard as { incidents?: unknown }).incidents)) throw new Error('Unable to load the property history.');
        if (!controller.signal.aborted) { setTickets(healthRows); setReports((reportsDashboard as { incidents: PropertyReport[] }).incidents); setError(''); }
      } catch (cause) {
        if (!controller.signal.aborted) setError((cause as Error).message);
      } finally { pending = false; if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    const timer = window.setInterval(() => { setClock(new Date()); void load(); }, 60000);
    const focus = () => { setClock(new Date()); void load(); };
    window.addEventListener('focus', focus);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [refresh]);
  const index = useMemo(() => indexPropertyHealthTickets(properties, tickets), [properties, tickets]);
  const reportIndex = useMemo(() => {
    const byProperty = new Map<string, PropertyReport[]>(properties.map((item) => [item.id, []]));
    const exactNames = new Map<string, HistoryProperty[]>();
    for (const item of properties) exactNames.set(propertyNameKey(item.name), [...(exactNames.get(propertyNameKey(item.name)) || []), item]);
    let unmatched = 0;
    for (const report of reports) {
      let match = report.propertyId ? properties.find((item) => item.id === report.propertyId) : undefined;
      if (!match) {
        const exact = exactNames.get(propertyNameKey(report.propertyName)) || [];
        if (exact.length === 1) match = exact[0];
      }
      if (!match) {
        const reportTokens = propertyWords(report.propertyName);
        const candidates = reportTokens.length < 2 ? [] : properties.filter((item) => {
          const propertyTokens = propertyWords(item.name);
          return reportTokens.every((word) => propertyTokens.includes(word)) || propertyTokens.every((word) => reportTokens.includes(word));
        });
        if (candidates.length === 1) match = candidates[0];
      }
      if (!match) { unmatched++; continue; }
      byProperty.get(match.id)!.push(report);
    }
    for (const rows of byProperty.values()) rows.sort((a, b) => (a.status === b.status ? 0 : a.status === 'PENDING' ? -1 : 1) || b.occurredAt.localeCompare(a.occurredAt));
    return { byProperty, unmatched };
  }, [properties, reports]);
  const propertyAlerts = useMemo(() => {
    const alerts = new Map<string, { pendingReports: number; healthRecords: number }>();
    for (const item of properties) {
      const pendingReports = (reportIndex.byProperty.get(item.id) || []).filter((report) => report.status === 'PENDING').length;
      const healthRecords = (index.byProperty.get(item.id) || []).filter((ticket) => ticket.status !== 'CLOSED').length;
      alerts.set(item.id, { pendingReports, healthRecords });
    }
    return alerts;
  }, [index.byProperty, properties, reportIndex.byProperty]);
  const alertTotals = useMemo(() => Array.from(propertyAlerts.values()).reduce((totals, alerts) => ({
    pendingReports: totals.pendingReports + alerts.pendingReports,
    healthRecords: totals.healthRecords + alerts.healthRecords,
  }), { pendingReports: 0, healthRecords: 0 }), [propertyAlerts]);
  const displayed = useMemo(() => properties.filter((property) => {
    const matchesSearch = propertyNameKey([property.name, property.addressLine1, property.city, property.managementCompany?.name].filter(Boolean).join(' ')).includes(propertyNameKey(search));
    const alerts = propertyAlerts.get(property.id) || { pendingReports: 0, healthRecords: 0 };
    const matchesAlert = alertFilter === 'all' || (alertFilter === 'reports' ? alerts.pendingReports > 0 : alerts.healthRecords > 0);
    return matchesSearch && matchesAlert;
  }).slice().sort((a, b) => a.name.localeCompare(b.name)), [alertFilter, properties, propertyAlerts, search]);
  const property = properties.find((item) => item.id === selectedId);
  const history = property ? index.byProperty.get(property.id) || [] : [];
  const reportHistory = property ? reportIndex.byProperty.get(property.id) || [] : [];
  const deadlines = history.map((ticket) => ({ ticket, date: healthDate(ticket.healthData?.['Fecha Límite'] || '') })).filter(({ ticket, date }) => ticket.status !== 'CLOSED' && date && daysUntilInspection(date, clock) >= 0).sort((a, b) => a.date.localeCompare(b.date));
  const totalLinked = Array.from(index.byProperty.values()).reduce((sum, rows) => sum + rows.length, 0);
  const totalReportsLinked = Array.from(reportIndex.byProperty.values()).reduce((sum, rows) => sum + rows.length, 0);
  function select(id: string) { setSelectedId(id); setSharePointUrlDraft(properties.find((item) => item.id === id)?.sharepointFolderUrl ?? ''); setTab('overview'); setEditingGeneral(false); setGeneralForm(null); setGeneralMessage(''); setEditingContacts(false); setContactForms([]); setContactsMessage(''); setEditingWaterBodies(false); setWaterBodyForms([]); setWaterBodiesMessage(''); }
  function startGeneralEditing() {
    if (!property) return;
    setGeneralForm(propertyToGeneralInformation(property));
    setEditingGeneral(true);
    setGeneralMessage('');
  }
  function updateGeneralField(field: keyof GeneralInformationForm, value: string) {
    setGeneralForm((current) => current ? { ...current, [field]: value } : current);
  }
  async function saveGeneralInformation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!property || !generalForm || savingGeneral) return;

    try {
      setSavingGeneral(true);
      setGeneralMessage('');
      const response = await fetch(`${API_URL}/properties/${property.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: generalForm.name.trim(),
          managementCompanyName: generalForm.managementCompanyName.trim(),
          propertyType: generalForm.propertyType || undefined,
          segment: generalForm.segment || undefined,
          addressLine1: generalForm.addressLine1.trim() || undefined,
          city: generalForm.city.trim() || undefined,
          county: generalForm.county.trim() || undefined,
          state: generalForm.state.trim() || undefined,
          zipCode: generalForm.zipCode.trim() || undefined,
          maintenanceChiefInfo: generalForm.maintenanceChiefInfo.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string | string[] } | null;
        const message = Array.isArray(payload?.message) ? payload.message.join(' ') : payload?.message;
        throw new Error(message || 'The property information could not be saved.');
      }

      const refreshedResponse = await fetch(`${API_URL}/properties/${property.id}`);
      if (!refreshedResponse.ok) throw new Error('The saved property could not be refreshed.');
      const updatedProperty = await refreshedResponse.json() as HistoryProperty;
      onPropertyUpdated(updatedProperty);
      setGeneralForm(propertyToGeneralInformation(updatedProperty));
      setEditingGeneral(false);
      setGeneralMessage('Changes saved. Commercial and Home are now updated.');
    } catch (cause) {
      setGeneralMessage((cause as Error).message);
    } finally {
      setSavingGeneral(false);
    }
  }
  async function createSharePointFolder() {
    if (!property || creatingSharePointFolder) return;

    try {
      setCreatingSharePointFolder(true);
      setGeneralMessage('');
      const response = await fetch(`${API_URL}/properties/${property.id}/sharepoint-folder`, { method: 'POST' });
      const payload = await response.json().catch(() => null) as HistoryProperty | { message?: string } | null;
      if (!response.ok) throw new Error(payload && 'message' in payload && payload.message ? payload.message : 'The SharePoint folder could not be created.');
      const updatedProperty = payload as HistoryProperty;
      onPropertyUpdated(updatedProperty);
      setSharePointUrlDraft(updatedProperty.sharepointFolderUrl ?? '');
      setGeneralMessage('SharePoint folder created and linked to this property.');
    } catch (cause) {
      setGeneralMessage((cause as Error).message);
    } finally {
      setCreatingSharePointFolder(false);
    }
  }
  async function saveSharePointUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!property || savingSharePointUrl) return;

    const sharepointFolderUrl = sharePointUrlDraft.trim();
    if (!isValidHttpUrl(sharepointFolderUrl)) {
      setGeneralMessage('Enter a valid SharePoint folder URL.');
      return;
    }

    try {
      setSavingSharePointUrl(true);
      setGeneralMessage('');
      const response = await fetch(`${API_URL}/properties/${property.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sharepointFolderUrl }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string | string[] } | null;
        const message = Array.isArray(payload?.message) ? payload.message.join(' ') : payload?.message;
        throw new Error(message || 'The SharePoint URL could not be saved.');
      }

      const refreshedResponse = await fetch(`${API_URL}/properties/${property.id}`);
      if (!refreshedResponse.ok) throw new Error('The saved property could not be refreshed.');
      const updatedProperty = await refreshedResponse.json() as HistoryProperty;
      onPropertyUpdated(updatedProperty);
      setSharePointUrlDraft(updatedProperty.sharepointFolderUrl ?? sharepointFolderUrl);
      setGeneralMessage('SharePoint URL saved. Commercial and Home are now updated.');
    } catch (cause) {
      setGeneralMessage((cause as Error).message);
    } finally {
      setSavingSharePointUrl(false);
    }
  }
  function startContactEditing() {
    if (!property) return;
    setContactForms(propertyToContactInformation(property));
    setEditingContacts(true);
    setContactsMessage('');
  }
  function addContact() {
    setContactForms((current) => [...current, {
      firstName: '', lastName: '', role: '', email: '', phone: '', isPrimary: current.length === 0,
    }]);
  }
  function updateContact(index: number, field: keyof ContactInformationForm, value: string | boolean) {
    setContactForms((current) => current.map((contact, contactIndex) => {
      if (field === 'isPrimary' && value === true) return { ...contact, isPrimary: contactIndex === index };
      return contactIndex === index ? { ...contact, [field]: value } as ContactInformationForm : contact;
    }));
  }
  function removeContact(index: number) {
    setContactForms((current) => {
      const removedPrimary = current[index]?.isPrimary;
      const remaining = current.filter((_, contactIndex) => contactIndex !== index);
      if (removedPrimary && remaining.length > 0) remaining[0] = { ...remaining[0], isPrimary: true };
      return remaining;
    });
  }
  function contactsAreValid() {
    const emails = contactForms.map((contact) => contact.email.trim().toLocaleLowerCase());
    return contactForms.length > 0 &&
      contactForms.some((contact) => contact.role === 'PROPERTY_MANAGER') &&
      contactForms.filter((contact) => contact.isPrimary).length === 1 &&
      contactForms.every((contact) => Boolean(contact.role) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim())) &&
      new Set(emails).size === emails.length;
  }
  async function saveContacts() {
    if (!property || savingContacts || !contactsAreValid()) return;

    try {
      setSavingContacts(true);
      setContactsMessage('');
      const response = await fetch(`${API_URL}/properties/${property.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: contactForms.map((contact) => ({
            contactId: contact.contactId,
            firstName: contact.firstName.trim() || undefined,
            lastName: contact.lastName.trim() || undefined,
            role: contact.role,
            email: contact.email.trim(),
            phone: contact.phone.trim() || undefined,
            isPrimary: contact.isPrimary,
          })),
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string | string[] } | null;
        const message = Array.isArray(payload?.message) ? payload.message.join(' ') : payload?.message;
        throw new Error(message || 'The contacts could not be saved.');
      }
      const refreshedResponse = await fetch(`${API_URL}/properties/${property.id}`);
      if (!refreshedResponse.ok) throw new Error('The saved contacts could not be refreshed.');
      const updatedProperty = await refreshedResponse.json() as HistoryProperty;
      onPropertyUpdated(updatedProperty);
      setContactForms(propertyToContactInformation(updatedProperty));
      setEditingContacts(false);
      setContactsMessage('Contacts updated in Home and Commercial.');
    } catch (cause) {
      setContactsMessage((cause as Error).message);
    } finally {
      setSavingContacts(false);
    }
  }
  function startWaterBodyEditing() {
    if (!property) return;
    setWaterBodyForms(propertyToWaterBodyInformation(property));
    setEditingWaterBodies(true);
    setWaterBodiesMessage('');
  }
  function addWaterBody() {
    setWaterBodyForms((current) => [...current, { name: '', type: 'SWIMMING_POOL', size: 'MEDIUM', gallons: '', active: true }]);
  }
  function updateWaterBody(index: number, field: keyof WaterBodyInformationForm, value: string | boolean) {
    setWaterBodyForms((current) => current.map((body, bodyIndex) => bodyIndex === index ? { ...body, [field]: value } as WaterBodyInformationForm : body));
  }
  function removeWaterBody(index: number) {
    setWaterBodyForms((current) => current.filter((_, bodyIndex) => bodyIndex !== index));
  }
  function waterBodiesAreValid() {
    return waterBodyForms.every((body) => {
      const gallonsValid = !body.gallons || (/^\d+$/.test(body.gallons) && Number(body.gallons) > 0);
      return Boolean(body.name.trim() && body.type && (body.type === 'SPA' || body.size) && gallonsValid);
    });
  }
  async function saveWaterBodies() {
    if (!property || savingWaterBodies || !waterBodiesAreValid()) return;

    try {
      setSavingWaterBodies(true);
      setWaterBodiesMessage('');
      const response = await fetch(`${API_URL}/properties/${property.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waterBodies: waterBodyForms.map((body) => ({
            name: body.name.trim(),
            type: body.type,
            size: body.type === 'SPA' ? undefined : body.size || undefined,
            gallons: body.gallons ? Number(body.gallons) : undefined,
            active: body.active,
          })),
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string | string[] } | null;
        const message = Array.isArray(payload?.message) ? payload.message.join(' ') : payload?.message;
        throw new Error(message || 'The water bodies could not be saved.');
      }
      const refreshedResponse = await fetch(`${API_URL}/properties/${property.id}`);
      if (!refreshedResponse.ok) throw new Error('The saved water bodies could not be refreshed.');
      const updatedProperty = await refreshedResponse.json() as HistoryProperty;
      onPropertyUpdated(updatedProperty);
      setWaterBodyForms(propertyToWaterBodyInformation(updatedProperty));
      setEditingWaterBodies(false);
      setWaterBodiesMessage('Water bodies updated in Home and Commercial.');
    } catch (cause) {
      setWaterBodiesMessage((cause as Error).message);
    } finally {
      setSavingWaterBodies(false);
    }
  }
  function stats(rows: PropertyHealthTicket[], propertyReports: PropertyReport[]) {
    return <div className="history-metrics"><article><span>Reports</span><strong>{propertyReports.length}</strong></article><article><span>Pending reports</span><strong>{propertyReports.filter((item) => item.status === 'PENDING').length}</strong></article><article><span>Solved reports</span><strong>{propertyReports.filter((item) => item.status === 'SOLVED').length}</strong></article><article><span>Health records</span><strong>{rows.length}</strong></article></div>;
  }
  function healthCard(ticket: PropertyHealthTicket) {
    const data = ticket.healthData || {};
    const inspection = ticketInspectionDate(ticket);
    const deadline = healthDate(data['Fecha Límite'] || '');
    const number = ticket.estimateNumber || data.Estimado || '';
    const comments = ticket.comments || [];
    return <article className="history-health-record" key={ticket.ticketNumber}>
      <div className="history-record-header"><div><span className="history-record-date">{healthHistoryDate(ticket) || 'Date not assigned'}</span><h3>{ticket.ticketNumber}</h3></div><span className={'health-status health-status-' + ticketStatus(ticket.status).toLowerCase().replace(' ', '-')}>{ticketStatus(ticket.status)}</span></div>
      <p className="history-record-subject">{ticket.subject}</p>
      <dl className="history-record-summary">{info('Inspection date', inspection)}{info('Reinspection deadline', deadline)}{info('Initial report status', englishHealthStatus(data.Estado))}{info('Final report status', englishHealthStatus(data['Estado Final']))}{number && <div className="history-estimate-number">{info('Estimate number', number)}</div>}{data['Estado Estimado'] && <div className="history-estimate-status">{info('Estimate status', englishHealthStatus(data['Estado Estimado']))}</div>}</dl>
      {data.Violaciones && <div className="history-violations"><strong>Violations</strong><p>{data.Violaciones}</p></div>}
      <details className="history-record-details"><summary>Inspection details and comments ({comments.length})</summary><dl className="history-record-summary">{info('Requires estimate', ticket.estimateStatus === 'REQUIRED' ? 'Yes' : 'No')}{checklistFields.filter(([field]) => data[field] && data[field] !== '[]').map(([field, title]) => info(title, checklist(data[field], field === 'Quimico')))}</dl><h4>Comment history</h4>{comments.length === 0 ? <p className="history-muted">No comments recorded.</p> : comments.map((comment) => <div className="history-comment" key={comment.id}><strong>{comment.author}</strong><time>{new Date(comment.createdAt).toLocaleString('en-US', { timeZone: 'America/Bogota' })}</time><p>{comment.body}</p></div>)}</details>
    </article>;
  }
  function reportCard(report: PropertyReport) {
    return <article className="history-health-record history-report-record" key={report.id}>
      <div className="history-record-header"><div><span className="history-record-date">{reportDate(report.occurredAt)}</span><h3>{report.type.name}</h3></div><span className={'history-report-status history-report-status-' + report.status.toLowerCase()}>{reportStatus(report.status)}</span></div>
      <p className="history-record-subject">{report.description}</p>
      <dl className="history-record-summary">{info('Importance', reportImportance(report.importance))}{info('Technician', report.technician.name)}{info('Supervisor', report.supervisor.name)}{info('Inspector', report.inspector?.name || 'Not applicable')}{info('Requires inspector', report.requiresInspector ? 'Yes' : 'No')}</dl>
      {report.resolution && <div className="history-report-resolution"><strong>Resolution</strong><p>{report.resolution}</p></div>}
      {report.attachments && report.attachments.length > 0 && <div className="history-report-files"><strong>Files</strong>{report.attachments.map((file) => <a key={file.id} href={file.sharepointWebUrl} target="_blank" rel="noreferrer">{file.fileName}</a>)}</div>}
    </article>;
  }
  function contactsPanel() {
    if (!property) return null;
    return <section className="history-panel"><div className="history-related-heading"><h2>Contacts</h2>{canEdit && !editingContacts && <button type="button" className="secondary-button" onClick={startContactEditing}>Edit</button>}</div>{contactsMessage && <div className="history-general-message" role="status">{contactsMessage}</div>}{editingContacts ? <div className="history-related-editor"><button type="button" className="history-add-related" onClick={addContact}>+ Add contact</button>{contactForms.map((contact, index) => <div className="history-related-card" key={contact.contactId || `new-contact-${index}`}><div className="history-related-card-heading"><strong>Contact {index + 1}</strong>{contactForms.length > 1 && <button type="button" onClick={() => removeContact(index)}>Remove</button>}</div><label><span>Role *</span><select value={contact.role} onChange={(event) => updateContact(index, 'role', event.target.value)}><option value="">Select role</option><option value="PROPERTY_MANAGER">Property Manager</option><option value="REGIONAL_MANAGER">Regional Manager</option><option value="MAINTENANCE_CHIEF">Maintenance Chief</option><option value="OTHER">Other</option></select></label><label><span>Email *</span><input type="email" value={contact.email} onChange={(event) => updateContact(index, 'email', event.target.value)} /></label><label><span>First name</span><input value={contact.firstName} onChange={(event) => updateContact(index, 'firstName', event.target.value)} /></label><label><span>Last name</span><input value={contact.lastName} onChange={(event) => updateContact(index, 'lastName', event.target.value)} /></label><label><span>Phone</span><input type="tel" value={contact.phone} onChange={(event) => updateContact(index, 'phone', event.target.value)} /></label><label className="history-related-check"><input type="radio" name="history-primary-contact" checked={contact.isPrimary} onChange={() => updateContact(index, 'isPrimary', true)} /><span>Primary contact</span></label></div>)}{contactForms.length === 0 && <span className="history-related-error">Add at least one contact.</span>}{!contactForms.some((contact) => contact.role === 'PROPERTY_MANAGER') && <span className="history-related-error">Add at least one Property Manager.</span>}{contactForms.filter((contact) => contact.isPrimary).length !== 1 && <span className="history-related-error">Select one primary contact.</span>}{new Set(contactForms.map((contact) => contact.email.trim().toLocaleLowerCase())).size !== contactForms.length && <span className="history-related-error">Contact email addresses cannot be repeated.</span>}<div className="history-related-actions"><button type="button" className="secondary-button" disabled={savingContacts} onClick={() => { setEditingContacts(false); setContactForms([]); setContactsMessage(''); }}>Cancel</button><button type="button" className="primary-button" disabled={savingContacts || !contactsAreValid()} onClick={saveContacts}>{savingContacts ? 'Saving…' : 'Save contacts'}</button></div></div> : <>{property.contacts.length === 0 && <p className="history-muted">No contacts registered.</p>}{property.contacts.map((relation) => <div className="history-contact" key={relation.id}><strong>{[relation.contact.firstName, relation.contact.lastName].filter(Boolean).join(' ') || 'Contact'}{relation.isPrimary ? ' · Primary' : ''}</strong><small>{label(relation.role)}</small><span>{relation.contact.email || 'Email not assigned'}</span><span>{relation.contact.phone || 'Phone not assigned'}</span></div>)}</>}</section>;
  }
  function waterBodiesPanel() {
    if (!property) return null;
    return <section className="history-panel"><div className="history-related-heading"><h2>Water bodies</h2>{canEdit && !editingWaterBodies && <button type="button" className="secondary-button" onClick={startWaterBodyEditing}>Edit</button>}</div>{waterBodiesMessage && <div className="history-general-message" role="status">{waterBodiesMessage}</div>}{editingWaterBodies ? <div className="history-related-editor"><button type="button" className="history-add-related" onClick={addWaterBody}>+ Add water body</button>{waterBodyForms.map((body, index) => <div className="history-related-card" key={`history-water-body-${index}`}><div className="history-related-card-heading"><strong>Water body {index + 1}</strong><button type="button" onClick={() => removeWaterBody(index)}>Remove</button></div><label><span>Type *</span><select value={body.type} onChange={(event) => updateWaterBody(index, 'type', event.target.value)}><option value="SWIMMING_POOL">Swimming Pool</option><option value="SPA">Spa</option><option value="KIDDIE_POOL">Kiddie Pool</option><option value="SPLASH_PAD">Splash Pad</option><option value="DECORATIVE_WATER_FEATURE">Decorative Water Feature</option><option value="OTHER">Other</option></select></label><label><span>Name or identifier *</span><input value={body.name} onChange={(event) => updateWaterBody(index, 'name', event.target.value)} /></label>{body.type !== 'SPA' && <label><span>Size *</span><select value={body.size} onChange={(event) => updateWaterBody(index, 'size', event.target.value)}><option value="">Select size</option><option value="SMALL">Small</option><option value="MEDIUM">Medium</option><option value="LARGE">Large</option><option value="EXTRA_LARGE">Extra Large</option></select></label>}<label><span>Gallons</span><input type="number" min="1" step="1" value={body.gallons} onChange={(event) => updateWaterBody(index, 'gallons', event.target.value)} /></label><label className="history-related-check"><input type="checkbox" checked={body.active} onChange={(event) => updateWaterBody(index, 'active', event.target.checked)} /><span>Active</span></label>{body.gallons && (!/^\d+$/.test(body.gallons) || Number(body.gallons) <= 0) && <span className="history-related-error">Gallons must be a whole number greater than zero.</span>}</div>)}{waterBodyForms.length === 0 && <p className="history-muted">No water bodies. Save to leave this property without water bodies.</p>}<div className="history-related-actions"><button type="button" className="secondary-button" disabled={savingWaterBodies} onClick={() => { setEditingWaterBodies(false); setWaterBodyForms([]); setWaterBodiesMessage(''); }}>Cancel</button><button type="button" className="primary-button" disabled={savingWaterBodies || !waterBodiesAreValid()} onClick={saveWaterBodies}>{savingWaterBodies ? 'Saving…' : 'Save water bodies'}</button></div></div> : <>{property.waterBodies.length === 0 && <p className="history-muted">No water bodies registered.</p>}{property.waterBodies.map((body) => <div className="history-contact" key={body.id}><strong>{body.name}</strong><small>{label(body.type)} · {body.active ? 'Active' : 'Inactive'}</small><span>{label(body.size)}{body.gallons != null ? ' · ' + body.gallons.toLocaleString('en-US') + ' gallons' : ''}</span></div>)}</>}</section>;
  }
  return <div className={`page app-page property-history-page${canEdit ? '' : ' history-read-only'}${onOpenHealth ? '' : ' history-no-health-navigation'}`}>{sidebar}
    <header className="area-page-header history-page-header">
      <div><span className="area-eyebrow">PROPERTY RECORDS</span><h1>{property ? property.name : 'Property history'}</h1>{property && <p className="history-header-description">One property. A shared history across your team.</p>}</div>
      <div className="history-header-actions">{canEdit && <button className="primary-button history-new-property" onClick={onNewProperty}>+ New property</button>}<button className="secondary-button history-refresh-button" onClick={() => setRefresh((value) => value + 1)}>Refresh history</button></div>
    </header>
    {error && <div role="alert" className="history-error">{error} <button onClick={() => setRefresh((value) => value + 1)}>Retry</button></div>}
    {!property ? <>
      <div className="history-directory-heading"><div className="history-directory-summary"><strong>{displayed.length} {displayed.length === 1 ? 'property' : 'properties'}</strong><span>{loading ? 'Loading property history…' : `${totalReportsLinked} linked Reports · ${totalLinked} linked Health records`}</span></div><div className="history-directory-tools"><div className="history-alert-filters" aria-label="Filter properties by notification"><button type="button" className={`history-alert-filter history-alert-filter-reports${alertFilter === 'reports' ? ' history-alert-filter-active' : ''}`} aria-pressed={alertFilter === 'reports'} aria-label={`${alertTotals.pendingReports} pending reports. Filter properties`} title="Properties with pending reports" onClick={() => setAlertFilter((current) => current === 'reports' ? 'all' : 'reports')}>{alertTotals.pendingReports}</button><button type="button" className={`history-alert-filter history-alert-filter-health${alertFilter === 'health' ? ' history-alert-filter-active' : ''}`} aria-pressed={alertFilter === 'health'} aria-label={`${alertTotals.healthRecords} Health records. Filter properties`} title="Properties with Health Department records" onClick={() => setAlertFilter((current) => current === 'health' ? 'all' : 'health')}>{alertTotals.healthRecords}</button></div><input type="search" aria-label="Search properties" placeholder="Search property, address or management company" value={search} onChange={(event) => setSearch(event.target.value)} /></div></div>
      {index.unmatched > 0 && !loading && <div className="history-link-notice">{index.unmatched} Health records need a matching Commercial property name. They are not assigned automatically to similar names. {onOpenHealth && <button onClick={onOpenHealth}>Review Health tickets →</button>}</div>}
      {reportIndex.unmatched > 0 && !loading && <div className="history-link-notice">{reportIndex.unmatched} Reports need a unique matching property name and remain available in the main Reports table.</div>}
      <div className="history-property-grid">{displayed.map((item) => {
        const records = index.byProperty.get(item.id) || [];
        const propertyReports = reportIndex.byProperty.get(item.id) || [];
        const { pendingReports, healthRecords } = propertyAlerts.get(item.id) || { pendingReports: 0, healthRecords: 0 };
        return <button className="history-property-card" key={item.id} onClick={() => select(item.id)}>
          {(pendingReports > 0 || healthRecords > 0) && <span className="history-property-notifications">
            {pendingReports > 0 && <span className="history-notification history-notification-reports" title={`${pendingReports} pending report${pendingReports === 1 ? '' : 's'}`} aria-label={`${pendingReports} pending reports`}>{pendingReports}</span>}
            {healthRecords > 0 && <span className="history-notification history-notification-health" title={`${healthRecords} Health record${healthRecords === 1 ? '' : 's'}`} aria-label={`${healthRecords} Health records`}>{healthRecords}</span>}
          </span>}
          <div className="history-property-card-top"><span className="history-property-avatar" aria-hidden="true">{item.name.slice(0, 2).toUpperCase()}</span><span className="history-lifecycle">{label(item.lifecycleStatus)}</span></div><h2>{item.name}</h2><p>{[item.addressLine1, item.city, item.state].filter(Boolean).join(', ') || 'Address not assigned'}</p><small>{item.managementCompany?.name || 'Management company not assigned'}</small><div className="history-property-card-footer"><span>{loading ? 'Loading…' : `${propertyReports.length} Reports · ${records.length} Health`}</span><strong>View record →</strong></div>
        </button>;
      })}</div>{displayed.length === 0 && <p className="history-empty">{properties.length === 0 ? 'No Commercial properties registered yet.' : alertFilter === 'reports' ? 'No properties have pending reports.' : alertFilter === 'health' ? 'No properties have Health Department records.' : 'No properties match your search.'}</p>}
    </> : <>
      <div className="history-property-navigation"><button className="history-back-button" onClick={() => setSelectedId(null)}>← All properties</button><label>Property<select value={property.id} onChange={(event) => select(event.target.value)}>{properties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      <nav className="history-tabs" aria-label="Property sections">{tabs.map(([key, title]) => <button key={key} aria-current={tab === key ? 'page' : undefined} className={tab === key ? 'history-tab-active' : ''} onClick={() => setTab(key)}>{title}{key === 'reports' && <span>{reportHistory.length}</span>}{key === 'health' && <span>{history.length}</span>}</button>)}</nav>
      {tab === 'overview' && <>{stats(history, reportHistory)}<div className="history-overview-grid"><section className="history-panel"><h2>Property overview</h2><dl className="history-info-grid">{info('Management company', property.managementCompany?.name)}{info('Address', [property.addressLine1, property.city, property.state, property.zipCode].filter(Boolean).join(', '))}{info('Property type', label(property.propertyType))}{info('Service status', label(property.lifecycleStatus))}</dl><button className="history-text-button" onClick={() => setTab('general')}>View general information →</button></section><section className="history-panel"><h2>Next reinspection deadline</h2>{deadlines[0] ? <><span className={'history-deadline health-inspection-' + inspectionSignal(daysUntilInspection(deadlines[0].date, clock))}>{deadlines[0].date}<small>{daysUntilInspection(deadlines[0].date, clock) === 0 ? 'Today' : daysUntilInspection(deadlines[0].date, clock) + ' days remaining'}</small></span><p>{deadlines[0].ticket.ticketNumber}</p><button className="history-text-button" onClick={() => setTab('health')}>View Health history →</button></> : <p className="history-muted">No upcoming reinspection deadline assigned.</p>}</section></div><section className="history-panel"><div className="history-panel-heading"><h2>Latest Reports</h2><button className="history-text-button" onClick={() => setTab('reports')}>View all →</button></div>{loading ? <p>Loading Reports history…</p> : reportHistory.length === 0 ? <p className="history-muted">No Reports linked to this property yet.</p> : <div className="history-timeline">{reportHistory.slice(0, 3).map(reportCard)}</div>}</section><section className="history-panel"><div className="history-panel-heading"><h2>Latest Health records</h2><button className="history-text-button" onClick={() => setTab('health')}>View all →</button></div>{loading ? <p>Loading Health history…</p> : history.length === 0 ? <p className="history-muted">No Health records linked to this property yet.</p> : <div className="history-timeline">{history.slice(0, 3).map(healthCard)}</div>}</section></>}
      {tab === 'general' && <div className="history-overview-grid"><section className="history-panel"><div className="history-panel-heading history-general-heading"><div><h2>General information</h2><p className="history-muted">Changes made here or in Commercial update the same property record.</p></div>{!editingGeneral && <button type="button" className="secondary-button history-edit-information" onClick={startGeneralEditing}>Edit</button>}</div>{generalMessage && <div className="history-general-message" role="status">{generalMessage}</div>}{editingGeneral && generalForm ? <form className="history-general-form" onSubmit={saveGeneralInformation}><div className="history-general-form-grid"><label><span>Property name</span><input required value={generalForm.name} onChange={(event) => updateGeneralField('name', event.target.value)} /></label><label><span>Property code</span><input value={property.code || ''} disabled /></label><label><span>Management company</span><input value={generalForm.managementCompanyName} onChange={(event) => updateGeneralField('managementCompanyName', event.target.value)} /></label><label><span>Property type</span><select required value={generalForm.propertyType} onChange={(event) => updateGeneralField('propertyType', event.target.value)}><option value="">Select type</option><option value="COMMERCIAL">Commercial</option><option value="RESIDENTIAL">Residential</option></select></label><label><span>Segment</span><select required value={generalForm.segment} onChange={(event) => updateGeneralField('segment', event.target.value)}><option value="">Select segment</option><option value="MULTIFAMILY">Multifamily</option><option value="HOA">HOA</option><option value="HOTEL">Hotel</option><option value="SINGLE_FAMILY">Single Family</option></select></label><label><span>Service status</span><input value={label(property.lifecycleStatus)} disabled /></label><label><span>Service start date</span><input type="date" value={property.serviceStartDate?.slice(0, 10) || ''} disabled /></label><label><span>Address</span><input value={generalForm.addressLine1} onChange={(event) => updateGeneralField('addressLine1', event.target.value)} /></label><label><span>City</span><input value={generalForm.city} onChange={(event) => updateGeneralField('city', event.target.value)} /></label><label><span>County</span><input value={generalForm.county} onChange={(event) => updateGeneralField('county', event.target.value)} /></label><label><span>State</span><input maxLength={2} value={generalForm.state} onChange={(event) => updateGeneralField('state', event.target.value.toUpperCase())} /></label><label><span>ZIP code</span><input value={generalForm.zipCode} onChange={(event) => updateGeneralField('zipCode', event.target.value)} /></label><label className="history-general-form-wide"><span>Maintenance contact information</span><textarea rows={3} value={generalForm.maintenanceChiefInfo} onChange={(event) => updateGeneralField('maintenanceChiefInfo', event.target.value)} /></label></div><div className="history-general-actions"><button type="button" className="secondary-button" disabled={savingGeneral} onClick={() => { setEditingGeneral(false); setGeneralForm(null); setGeneralMessage(''); }}>Cancel</button><button type="submit" className="primary-button" disabled={savingGeneral || !generalForm.name.trim() || !generalForm.propertyType || !generalForm.segment}>{savingGeneral ? 'Saving…' : 'Save changes'}</button></div></form> : <dl className="history-info-grid">{info('Property name', property.name)}{info('Property code', property.code)}{info('Management company', property.managementCompany?.name)}{info('Property type', label(property.propertyType))}{info('Segment', label(property.segment))}{info('Service status', label(property.lifecycleStatus))}{info('Service start date', healthDate(property.serviceStartDate || ''))}{info('Address', property.addressLine1)}{info('City', property.city)}{info('County', property.county)}{info('State', property.state)}{info('ZIP code', property.zipCode)}{info('Maintenance contact information', property.maintenanceChiefInfo)}</dl>}<dl className="history-info-grid history-sharepoint-grid"><div className="history-info-item history-sharepoint-field"><dt>SharePoint folder</dt><dd>{property.sharepointFolderUrl ? <a href={property.sharepointFolderUrl} target="_blank" rel="noreferrer">Open SharePoint folder →</a> : <form className="history-sharepoint-actions" onSubmit={saveSharePointUrl}><div className="history-sharepoint-url-row"><input type="url" aria-label="SharePoint folder URL" placeholder="Paste the SharePoint folder URL" value={sharePointUrlDraft} onChange={(event) => setSharePointUrlDraft(event.target.value)} required /><button type="submit" className="secondary-button" disabled={savingSharePointUrl || !sharePointUrlDraft.trim()}>{savingSharePointUrl ? 'Saving…' : 'Save URL'}</button></div><span className="history-sharepoint-or">or</span><button type="button" className="history-create-sharepoint" onClick={createSharePointFolder} disabled={creatingSharePointFolder || savingSharePointUrl}>{creatingSharePointFolder ? 'Creating folder…' : 'Create SharePoint folder'}</button></form>}</dd></div></dl></section><div className="history-side-panels">{contactsPanel()}{waterBodiesPanel()}</div></div>}
      {tab === 'reports' && <section className="history-panel"><div className="history-panel-heading"><div><h2>Reports history</h2><p className="history-muted">Live records from Nathalia's Reports table, grouped with pending reports first.</p></div></div>{loading ? <p>Loading Reports history…</p> : reportHistory.length === 0 ? <p className="history-empty">No Reports match this property's name.</p> : <div className="history-timeline">{reportHistory.map(reportCard)}</div>}</section>}
      {tab === 'health' && <section className="history-panel"><div className="history-panel-heading"><div><h2>Health Department history</h2><p className="history-muted">Live records from Health Department, including closed tickets and comment history.</p></div><button className="secondary-button" onClick={onOpenHealth}>Open Health Department</button></div>{loading ? <p>Loading Health history…</p> : history.length === 0 ? <p className="history-empty">No Health tickets match this property's Commercial name.</p> : <div className="history-timeline">{history.map(healthCard)}</div>}</section>}
    </>}
  </div>;
}
