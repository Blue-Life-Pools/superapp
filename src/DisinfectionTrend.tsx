import type { FocusEvent, ReactNode } from 'react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { disinfectionChemicals, disinfectionTotals, disinfectionUsageDetails } from './disinfectionTrendData';
import type { DisinfectionPeriod, DisinfectionSelection } from './disinfectionTrendData';
import './DisinfectionTrend.css';

const money = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const quantity = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 4 });
const monthLabel = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const selectionLabels = { all: 'All chemicals', sanitizer: 'Sanitizer chemicals', balance: 'Stabilizer / acid / other', liquid: 'Liquid chlorine', tablets: 'Chlorine tablets', powder: 'Chlorine powder', stabilizer: 'Stabilizer', acid: 'Acid', other: 'Other chemicals' };
type Row = DisinfectionPeriod & { month: string; totals: ReturnType<typeof disinfectionTotals> };
type Detail = { key: string; row: Row; selection: DisinfectionSelection; anchor: HTMLButtonElement; pinned: boolean };

export function DisinfectionTrend({ periods }: { periods: DisinfectionPeriod[] }) {
  const rows = periods.filter((item): item is DisinfectionPeriod & { month: string } => Boolean(item.sourceName && item.month && item.monthlyFee != null)).sort((a, b) => a.month.localeCompare(b.month)).map((item) => ({ ...item, totals: disinfectionTotals(item.chemicals) }));
  const maxTotal = Math.max(...rows.map((row) => row.totals.total), 1);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [position, setPosition] = useState({ left: 12, top: 12, maxHeight: 420 });
  const popupId = useId();
  const popupRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreFocus = useRef<HTMLButtonElement | null>(null);

  const keepOpen = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);
  const leaveDetail = useCallback(() => {
    keepOpen();
    closeTimer.current = setTimeout(() => setDetail((current) => current?.pinned ? current : null), 180);
  }, [keepOpen]);
  const dismiss = useCallback((restoreFocus = false) => {
    keepOpen();
    if (restoreFocus && detail) {
      ignoreFocus.current = detail.anchor;
      detail.anchor.focus({ preventScroll: true });
    }
    setDetail(null);
  }, [detail, keepOpen]);

  const placeDetail = useCallback((current: Detail) => {
    if (!popupRef.current) return;
    const anchor = current.anchor.getBoundingClientRect();
    const popup = popupRef.current.getBoundingClientRect();
    const contents = popupRef.current.querySelector('.disinfection-usage-products');
    const desiredHeight = Math.min(420, (contents?.scrollHeight ?? 0) + (popupRef.current.querySelector('header')?.getBoundingClientRect().height ?? 0) + (popupRef.current.querySelector('footer')?.getBoundingClientRect().height ?? 0) + 2);
    const below = window.innerHeight - anchor.bottom - 22;
    const above = anchor.top - 22;
    const useBelow = below >= desiredHeight || below >= above;
    const maxHeight = Math.min(420, Math.max(160, useBelow ? below : above), window.innerHeight - 24);
    const height = Math.min(desiredHeight, maxHeight);
    setPosition({
      left: Math.max(12, Math.min(anchor.left + anchor.width / 2 - popup.width / 2, window.innerWidth - popup.width - 12)),
      top: Math.max(12, Math.min(useBelow ? anchor.bottom + 10 : anchor.top - height - 10, window.innerHeight - height - 12)),
      maxHeight,
    });
  }, []);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  useEffect(() => {
    if (!detail) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!detail.anchor.contains(target) && !popupRef.current?.contains(target)) dismiss();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); dismiss(true); }
    };
    const scroll = (event: Event) => { if (!(event.target instanceof Node) || !popupRef.current?.contains(event.target)) placeDetail(detail); };
    const resize = () => placeDetail(detail);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', resize);
    };
  }, [detail, dismiss, placeDetail]);

  useLayoutEffect(() => {
    if (detail) placeDetail(detail);
  }, [detail, placeDetail]);

  function trigger(row: Row, selection: DisinfectionSelection, children: ReactNode, className = 'disinfection-detail-trigger', height?: number, source = 'table') {
    const key = `${row.month}-${selection}-${source}`;
    const expanded = detail?.key === key;
    const open = (anchor: HTMLButtonElement) => {
      keepOpen();
      setDetail((current) => current?.pinned ? current : { key, row, selection, anchor, pinned: false });
    };
    const focus = (event: FocusEvent<HTMLButtonElement>) => {
      if (ignoreFocus.current === event.currentTarget) { ignoreFocus.current = null; return; }
      open(event.currentTarget);
    };
    return <button type="button" className={className} style={height === undefined ? undefined : { height: `${height}%` }} aria-label={`${monthLabel(row.month)} · ${selectionLabels[selection]} · usage details`} aria-haspopup="dialog" aria-expanded={expanded} aria-controls={expanded ? popupId : undefined}
      onMouseEnter={(event) => open(event.currentTarget)} onMouseLeave={leaveDetail} onFocus={focus}
      onBlur={(event) => { if (!popupRef.current?.contains(event.relatedTarget as Node)) leaveDetail(); }}
      onClick={(event) => { keepOpen(); const anchor = event.currentTarget; setDetail((current) => current?.key === key && current.pinned ? null : { key, row, selection, anchor, pinned: true }); }}>
      {children}
    </button>;
  }

  const products = detail ? disinfectionUsageDetails(disinfectionChemicals(detail.row.chemicals, detail.selection)) : [];
  return <section className="consumption-disinfection-panel">
    <header><div><h3>Disinfection mix and contribution</h3><p>Actual recorded months only. Sanitizer mix excludes acid and stabilizer; balance chemicals remain visible in the table.</p></div><span>{rows.length} month{rows.length === 1 ? '' : 's'}</span></header>
    {!rows.length ? <p className="consumption-empty">No previous uploaded months with monthly fee data are available for this property.</p> : <>
      <p className="disinfection-interaction-hint">Hover over a color for chemical quantities and technician usage. Click a month to see all chemicals.</p>
      <div className="consumption-disinfection-chart" aria-label="Monthly disinfection chemical cost trend">
        {rows.map((row) => <div className="consumption-disinfection-column" key={row.month}>
          <div className="consumption-disinfection-bar">
            {(['liquid', 'tablets', 'powder', 'balance'] as const).map((selection) => {
              const cost = selection === 'balance' ? row.totals.stabilizer + row.totals.acid + row.totals.other : row.totals[selection];
              return cost > 0 ? <div className="disinfection-segment-slot" key={selection} style={{ height: `${cost / maxTotal * 100}%` }}>{trigger(row, selection, null, `disinfection-segment disinfection-${selection}`, 100, 'chart')}</div> : null;
            })}
          </div>
          <strong>{trigger(row, 'all', monthLabel(row.month), 'disinfection-detail-trigger disinfection-month-trigger', undefined, 'chart-month')}</strong>
        </div>)}
      </div>
      <div className="consumption-disinfection-legend"><span><i className="disinfection-liquid" />Liquid chlorine</span><span><i className="disinfection-tablets" />Tablets</span><span><i className="disinfection-powder" />Chlorine powder</span><span><i className="disinfection-balance" />Stabilizer / acid / other</span></div>
      <div className="consumption-disinfection-table-wrap"><table className="consumption-disinfection-table"><thead><tr><th>Month</th><th>Sanitizer mix</th><th>Sanitizer cost</th><th>Balance cost</th><th>Total chemical cost</th><th>% of monthly fee</th><th>After-chemical contribution</th></tr></thead><tbody>{rows.map((row) => {
        const sanitizer = row.totals.liquid + row.totals.tablets + row.totals.powder;
        const balance = row.totals.total - sanitizer;
        const feePercent = row.monthlyFee ? row.totals.total / row.monthlyFee * 100 : null;
        return <tr key={row.month}><th>{trigger(row, 'all', monthLabel(row.month))}</th><td>{trigger(row, 'sanitizer', `Liquid ${sanitizer ? (row.totals.liquid / sanitizer * 100).toFixed(0) : 0}% · Tabs ${sanitizer ? (row.totals.tablets / sanitizer * 100).toFixed(0) : 0}%`, undefined, undefined, 'mix')}</td><td>{trigger(row, 'sanitizer', money(sanitizer))}</td><td>{trigger(row, 'balance', money(balance))}</td><td>{trigger(row, 'all', money(row.totals.total), undefined, undefined, 'total')}</td><td>{feePercent == null ? '—' : `${feePercent.toFixed(1)}%`}</td><td>{money((row.monthlyFee || 0) - row.totals.total)}</td></tr>;
      })}</tbody></table></div>
    </>}
    {detail && createPortal(<div id={popupId} ref={popupRef} role="dialog" aria-modal="false" aria-label={`${monthLabel(detail.row.month)} · ${selectionLabels[detail.selection]}`} className="disinfection-usage-popover" style={{ left: position.left, top: position.top, maxHeight: position.maxHeight }} onMouseEnter={keepOpen} onMouseLeave={leaveDetail}>
      <header><div><strong>{monthLabel(detail.row.month)}</strong><span>{selectionLabels[detail.selection]}</span></div><button type="button" aria-label="Close chemical usage details" onClick={() => dismiss(true)}>×</button></header>
      <div className="disinfection-usage-products">
        {products.length === 0 && <p className="disinfection-usage-empty">No usage recorded for this selection.</p>}
        {products.map((product) => <section className="disinfection-usage-product" key={`${product.name}-${product.unit}`}>
          <div className="disinfection-usage-product-heading"><strong>{product.name}</strong><span>{quantity(product.quantity)} {product.unit} · {money(product.cost)}</span></div>
          <div className="disinfection-usage-headings" aria-hidden="true"><span>Technician</span><span>Quantity</span><span>Cost</span></div>
          {product.technicians.map((person) => <div className="disinfection-usage-person" key={person.name}><span>{person.name}{person.name.toLowerCase().includes('georky') && <small>Tank refill</small>}</span><span>{quantity(person.quantity)} {product.unit}</span><span>{money(person.cost)}</span></div>)}
        </section>)}
      </div>
      <footer><span>Recorded chemical cost</span><strong>{money(products.reduce((sum, product) => sum + product.cost, 0))}</strong></footer>
    </div>, document.body)}
  </section>;
}
