import { useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import type { Inspection } from './QualityInspectionsPage';
import { filterQualityInspections } from './qualityInspectionFilters';
import { WorkspaceIcon } from './WorkspaceIcon';

const displayDate = (date: string) => new Date(date).toLocaleString('en-US', { timeZone: 'America/Bogota' });
const listValues = (values: Record<string, string> | null) => Object.entries(values || {}).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join(' · ');
const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function QualityPeriodReport({ items, initialBasis, onClose }: { items: Inspection[]; initialBasis: 'VISIT' | 'RESOLVED'; onClose: () => void }) {
  const [mode, setMode] = useState('ALL');
  const [basis, setBasis] = useState(initialBasis);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const visits = useMemo(() => filterQualityInspections(items, { property: 'ALL', technician: 'ALL', status: 'ALL', severity: 'ALL', estimate: 'ALL', dashboard: 'ALL', dateBasis: basis, dateMode: mode, day: from, from, to }), [items, basis, mode, from, to]);
  const findings = visits.flatMap((item) => item.findings);
  const invalid = mode !== 'ALL' && (!from || mode === 'RANGE' && (!to || from > to));
  const periodLabel = mode === 'ALL' ? 'Current selection · All dates' : mode === 'DAY' ? from : `${from} to ${to}`;
  const filename = `quality-inspections-${mode === 'ALL' ? 'selection' : mode === 'DAY' ? from : `${from}_${to}`}`;
  function csv() {
    const headers = ['Visit date (Colombia)', 'Property', 'Water body', 'Technician', 'Readings', 'Dosages', 'Notes', 'Finding', 'Importance', 'Status', 'Responsible', 'Requires estimate', 'Estimate number', 'Estimate sent date', 'Resolution', 'Resolved date', 'Resolved by'];
    const rows = visits.flatMap((item) => (item.findings.length ? item.findings : [null]).map((finding) => [displayDate(item.visitDate), item.property.name, item.waterBody?.name || '', item.technicianName, listValues(item.readings), listValues(item.dosages), item.notes, finding?.description, finding?.severity, finding?.status, finding?.responsibleName, finding ? finding.requiresEstimate ? 'Yes' : 'No' : '', finding?.estimateNumber, finding?.estimateSentAt ? displayDate(finding.estimateSentAt) : '', finding?.resolution, finding?.resolvedAt ? displayDate(finding.resolvedAt) : '', finding?.resolvedByName]));
    download(new Blob(['\uFEFF', [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
  }
  async function pdf() {
    setBusy(true); setError('');
    try {
      const doc = new jsPDF({ compress: true });
      let y = 20;
      function text(value: string, size = 10, bold = false) {
        doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(bold ? '#0c1b35' : '#334155');
        const lines = doc.splitTextToSize(value, 174) as string[];
        for (const line of lines) { if (y > 275) { doc.addPage(); y = 20; } doc.text(line, 18, y); y += size * .48; }
        y += 3;
      }
      text('Quality inspections', 20, true); text(periodLabel, 11); text(`Date basis: ${basis === 'RESOLVED' ? 'Resolved date' : 'Inspection date'} · Colombia time`, 9);
      text(`${visits.length} visits · ${findings.length} findings · ${findings.filter((finding) => finding.status !== 'RESOLVED').length} pending · ${findings.filter((finding) => finding.status === 'RESOLVED').length} solved`, 10, true);
      for (const item of visits) {
        if (y > 235) { doc.addPage(); y = 20; }
        doc.setDrawColor('#dce3ef'); doc.line(18, y, 192, y); y += 9;
        text(item.property.name, 13, true); text(`${displayDate(item.visitDate)} · ${item.waterBody?.name || 'Water body not recorded'} · ${item.technicianName}`, 9);
        if (listValues(item.readings)) text(`Readings: ${listValues(item.readings)}`);
        if (listValues(item.dosages)) text(`Dosages: ${listValues(item.dosages)}`);
        if (item.notes) text(`Notes: ${item.notes}`);
        for (const finding of item.findings) {
          text(`${finding.severity} · ${finding.status.replaceAll('_', ' ')}${finding.requiresEstimate ? ' · Requires estimate' : ''}`, 9, true);
          text(finding.description);
          if (finding.responsibleName) text(`Responsible: ${finding.responsibleName}`, 9);
          if (finding.resolution) text(`Resolution: ${finding.resolution}${finding.resolvedAt ? ` · ${displayDate(finding.resolvedAt)}` : ''}`, 9);
          if (finding.estimateNumber) text(`Estimate #${finding.estimateNumber}${finding.estimateSentAt ? ` · Sent ${displayDate(finding.estimateSentAt)}` : ''}`, 9);
          if (finding.resolvedByName || finding.resolutionUpdatedByName) text([finding.resolvedByName && `Resolved by ${finding.resolvedByName}`, finding.resolutionUpdatedByName && `Written by ${finding.resolutionUpdatedByName}`].filter(Boolean).join(' · '), 9);
        }
      }
      for (let page = 1; page <= doc.getNumberOfPages(); page++) { doc.setPage(page); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor('#64748b'); doc.text(`${page} / ${doc.getNumberOfPages()}`, 192, 288, { align: 'right' }); }
      download(doc.output('blob'), `${filename}.pdf`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not create the report.'); }
    finally { setBusy(false); }
  }
  return <div className="modal-backdrop"><section className="property-modal quality-period-modal" role="dialog" aria-modal="true" aria-labelledby="quality-period-title">
    <header className="quality-dialog-heading"><div><span>QUALITY INSPECTIONS</span><h2 id="quality-period-title">Period report</h2></div><button type="button" onClick={onClose} aria-label="Close period report"><WorkspaceIcon name="close" /></button></header>
    <p>Includes every visit in the current filters, across all pages. Choose dates to narrow the selection.</p>
    <div className="quality-period-controls"><label>Period<select aria-label="Report period" value={mode} onChange={(event) => setMode(event.target.value)}><option value="ALL">All dates</option><option value="DAY">Specific date</option><option value="RANGE">Date range</option></select></label><label>Date based on<select aria-label="Report date basis" value={basis} onChange={(event) => setBasis(event.target.value as 'VISIT' | 'RESOLVED')}><option value="VISIT">Inspection date</option><option value="RESOLVED">Resolved date</option></select></label>{mode !== 'ALL' && <label>{mode === 'DAY' ? 'Date' : 'From'}<input aria-label="Report from date" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>}{mode === 'RANGE' && <label>To<input aria-label="Report to date" type="date" min={from || undefined} value={to} onChange={(event) => setTo(event.target.value)} /></label>}</div>
    <div className="quality-period-totals"><span><strong>{visits.length}</strong> visits</span><span><strong>{findings.length}</strong> findings</span><span><strong>{findings.filter((finding) => finding.status === 'RESOLVED').length}</strong> solved</span></div>
    <div className="quality-period-preview">{visits.length ? visits.map((item) => <div key={item.id}><strong>{item.property.name}</strong><span>{displayDate(item.visitDate)}</span><span>{item.findings.length} findings</span></div>) : <p>No visits match this selection.</p>}</div>
    {error && <p role="alert" className="quality-status-message">{error}</p>}
    <footer className="quality-dialog-actions"><button type="button" className="quality-button quality-button-secondary" onClick={onClose}>Close</button><button type="button" className="quality-button quality-button-secondary" disabled={invalid || !visits.length || busy} onClick={csv}>Export CSV</button><button type="button" className="quality-button quality-button-primary" disabled={invalid || !visits.length || busy} onClick={() => void pdf()}><WorkspaceIcon name="download" />{busy ? 'Creating PDF…' : 'Export PDF'}</button></footer>
  </section></div>;
}
