import { WorkspaceIcon } from './WorkspaceIcon';
import type { buildCommercialStats, commercialProposalTrend } from './commercialDashboardData';

type Status = 'CREATED' | 'SENT' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
const stages: { status: Status; label: string; color: string; icon: 'reports' | 'check' | 'complaints' | 'close' | 'clock' }[] = [
  { status: 'CREATED', label: 'Created', color: '#9ccbff', icon: 'reports' },
  { status: 'APPROVED', label: 'Approved', color: '#0875dc', icon: 'check' },
  { status: 'SENT', label: 'Sent · No Response', color: '#b9a9f7', icon: 'complaints' },
  { status: 'REJECTED', label: 'Rejected', color: '#ffa3b0', icon: 'close' },
  { status: 'EXPIRED', label: 'Expired', color: '#f4cd57', icon: 'clock' },
];
const typeColors = ['#0875dc', '#9ccbff', '#d4e7ff', '#b9a9f7'];
const money = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const number = (value: number) => value.toLocaleString('en-US');
const label = (value: string) => value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const commercialMonthLabel = (month: string) => new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function ring(entries: { count: number; color: string }[]) {
  const total = entries.reduce((sum, item) => sum + item.count, 0);
  if (!total) return '#e9eef6';
  let cursor = 0;
  return `conic-gradient(${entries.map((item) => { const start = cursor; cursor += item.count / total * 100; return `${item.color} ${start}% ${cursor}%`; }).join(',')})`;
}

export function CommercialPeriodFilter({ month, months, onChange, name }: { month: string; months: string[]; onChange: (month: string) => void; name: string }) {
  return <label className="commercial-period"><WorkspaceIcon name="calendar" /><select aria-label={name} value={month} onChange={(event) => onChange(event.target.value)}><option value="all">All months</option>{months.map((item) => <option value={item} key={item}>{commercialMonthLabel(item)}</option>)}</select></label>;
}

export function CommercialDashboard({ stats, trend, month, months, onMonthChange, selectedStatus, onStatusChange }: {
  stats: ReturnType<typeof buildCommercialStats>;
  trend: ReturnType<typeof commercialProposalTrend>;
  month: string; months: string[]; onMonthChange: (month: string) => void;
  selectedStatus: Status | null; onStatusChange: (status: Status) => void;
}) {
  const typeOrder: Record<string, number> = { COMMERCIAL: 0, RESIDENTIAL: 1, UNSPECIFIED: 2 };
  const types = Object.entries(stats.typeCounts).sort(([a], [b]) => (typeOrder[a] ?? 3) - (typeOrder[b] ?? 3) || a.localeCompare(b));
  const management = Object.entries(stats.managementCounts).sort(([, a], [, b]) => b - a).slice(0, 6);
  const managementMax = Math.max(...management.map(([, count]) => count), 1);
  const approved = stats.proposalCounts.APPROVED ?? 0;
  const rate = stats.totalProposals ? approved / stats.totalProposals * 100 : 0;
  const trendMax = Math.max(...trend.map((item) => item.value), 1);
  const percentage = (count: number, total: number) => total ? (count / total * 100).toLocaleString('en-US', { maximumFractionDigits: 1 }) : '0';
  const kpis = [
    { name: 'Active properties', value: stats.propertyCount, icon: 'properties', style: 'blue' },
    { name: 'Management companies', value: Object.keys(stats.managementCounts).filter((name) => name !== 'Unassigned').length, icon: 'users', style: 'purple' },
    { name: 'Total proposals', value: stats.totalProposals, icon: 'reports', style: 'amber' },
    { name: 'Clients', value: stats.clientCount, icon: 'users', style: 'green' },
  ] as const;
  return <section className="commercial-overview" aria-label="Commercial overview">
    <div className="commercial-kpis">{kpis.map((item) => <article className={`commercial-kpi commercial-kpi-${item.style}`} key={item.name}>
      <span className="commercial-kpi-icon"><WorkspaceIcon name={item.icon} /></span><div><span>{item.name}</span><strong>{number(item.value)}</strong></div>
    </article>)}</div>
    <div className="commercial-distributions">
      <article className="commercial-card commercial-type-card"><h2>Properties by type</h2><div className="commercial-type-content">
        <div className="commercial-donut" role="img" aria-label={`${number(stats.propertyCount)} properties by type`} style={{ background: ring(types.map(([, count], index) => ({ count, color: typeColors[index % typeColors.length] }))) }}><div><strong>{number(stats.propertyCount)}</strong><span>Properties</span></div></div>
        <div className="commercial-type-legend">{types.map(([type, count], index) => <div key={type}><i style={{ background: typeColors[index % typeColors.length] }} /><span>{label(type)}</span><strong>{number(count)}</strong><small>({percentage(count, stats.propertyCount)}%)</small></div>)}{!types.length && <p>No properties in this search.</p>}</div>
      </div></article>
      <article className="commercial-card commercial-management-card"><h2>Properties by management</h2><div className="commercial-management-bars">{management.map(([company, count]) => <div key={company}><span title={company}>{company}</span><div className="commercial-bar-track"><i style={{ width: `${count / managementMax * 100}%` }} /></div><strong>{number(count)}</strong></div>)}{!management.length && <p>No management data in this search.</p>}</div></article>
    </div>
    <div className="commercial-proposals">
      <article className="commercial-card commercial-proposal-card">
        <div className="commercial-proposal-heading"><span className="commercial-section-icon"><WorkspaceIcon name="layers" /></span><div><span>COMMERCIAL POOL</span><h2>Monthly Proposal Value</h2><p>Proposal values and approval activity for the selected period.</p></div><CommercialPeriodFilter month={month} months={months} onChange={onMonthChange} name="Monthly proposal period" /></div>
        <div className="commercial-proposal-content">
          <div className="commercial-proposal-total"><span>Total Proposal Value</span><strong>{money(stats.totalProposalValue)}</strong><small>{number(stats.totalProposals)} proposals</small><span className="commercial-created-caption">Created: {money(stats.proposalValues.CREATED ?? 0)} · {number(stats.proposalCounts.CREATED ?? 0)} proposals</span><svg viewBox="0 0 300 65" preserveAspectRatio="none" aria-hidden="true"><path d="M0 55C40 25 60 65 100 38S160 47 200 25 250 35 300 5V65H0Z" fill="#c6e6ff" /><path d="M0 63C45 48 55 65 110 48S180 55 225 30 275 42 300 23V65H0Z" fill="#dcedff" /></svg></div>
          <div className="commercial-approval"><div className="commercial-donut commercial-approval-donut" role="img" aria-label={`Approval rate ${percentage(approved, stats.totalProposals)} percent`} style={{ background: ring(stages.map((item) => ({ count: stats.proposalCounts[item.status] ?? 0, color: item.color }))) }}><div><span>Approval<br />Rate</span><strong>{rate.toLocaleString('en-US', { maximumFractionDigits: 1 })}%</strong></div></div>
            <div className="commercial-proposal-legend">{[stages[1], stages[0], ...stages.slice(2)].map((item) => <div key={item.status}><i style={{ background: item.color }} /><span>{item.label}</span><strong>{number(stats.proposalCounts[item.status] ?? 0)}</strong><small>({percentage(stats.proposalCounts[item.status] ?? 0, stats.totalProposals)}%)</small></div>)}</div>
          </div>
          <div className="commercial-trend"><h3>Proposal Value Trend</h3>{trend.length ? <div className="commercial-trend-chart"><div className="commercial-trend-scale">{[1, .75, .5, .25, 0].map((fraction) => <span key={fraction}>{(trendMax * fraction).toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })}</span>)}</div><div className="commercial-trend-bars">{trend.map((item, index) => <div key={item.month} className={index === trend.length - 1 ? 'commercial-trend-current' : ''}><div className="commercial-trend-column" title={`${commercialMonthLabel(item.month)}: ${money(item.value)} · ${item.count} proposals`}><i style={{ height: `${item.value / trendMax * 100}%` }} /><span className="sr-only">{commercialMonthLabel(item.month)}: {money(item.value)}, {item.count} proposals</span></div><small>{new Date(`${item.month}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</small></div>)}</div></div> : <p className="commercial-chart-empty">No proposal history for this search.</p>}</div>
        </div>
      </article>
      <aside className="commercial-card commercial-proposal-stages" aria-label="Proposal value stage">{stages.map((item) => <button type="button" key={item.status} className={`commercial-stage commercial-stage-${item.status.toLowerCase()}`} aria-pressed={selectedStatus === item.status} onClick={() => onStatusChange(item.status)}><span className="commercial-stage-icon"><WorkspaceIcon name={item.icon} /></span><strong>{item.label}</strong><b>{money(stats.proposalValues[item.status] ?? 0)}</b><small>{number(stats.proposalCounts[item.status] ?? 0)} {(stats.proposalCounts[item.status] ?? 0) === 1 ? 'proposal' : 'proposals'}</small></button>)}</aside>
    </div>
  </section>;
}
