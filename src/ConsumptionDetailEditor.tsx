import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ConsumptionChemical } from './chemicalConsumptionImport';
import { changeChemicalCost, chemicalEditError, editableChemicals } from './consumptionEditing';
import type { ConsumptionEditMode, EditableWaterBody } from './consumptionEditing';
import { WorkspaceIcon } from './WorkspaceIcon';
import './ConsumptionDetailEditor.css';

type Props = {
  mode: ConsumptionEditMode;
  property: { id: string; name: string; waterBodies: EditableWaterBody[] };
  period: { chemicals: ConsumptionChemical[]; monthlyFee: number | null; technicianOverride?: string | null };
  month: string;
  automaticTechnician: string;
  onClose: () => void;
  onSave: (path: string, data: unknown) => Promise<void>;
};
const titles: Record<ConsumptionEditMode, string> = { chemicals: 'Edit chemical consumption', calculation: 'Edit chemical spending calculation', waterBodies: 'Edit water bodies', technician: 'Edit technician' };
const bodyTypes = ['POOL', 'SWIMMING_POOL', 'SPA', 'FOUNTAIN', 'KIDDIE_POOL', 'SPLASH_PAD', 'DECORATIVE_WATER_FEATURE', 'OTHER'];
const sizes = ['SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE'];
const titleCase = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/^./, letter => letter.toUpperCase());
const money = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export function ConsumptionDetailEditor({ mode, property, period, month, automaticTechnician, onClose, onSave }: Props) {
  const [chemicals, setChemicals] = useState(() => editableChemicals(period.chemicals));
  const [bodies, setBodies] = useState(() => property.waterBodies.map(body => ({ ...body })));
  const [fee, setFee] = useState(period.monthlyFee == null ? '' : String(period.monthlyFee));
  const [manualTechnician, setManualTechnician] = useState(Boolean(period.technicianOverride));
  const [technician, setTechnician] = useState(period.technicianOverride || automaticTechnician);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const titleId = useId(), technicianListId = useId();
  const total = chemicals.reduce((sum, chemical) => sum + chemical.cost, 0);
  const effectiveFee = mode === 'calculation' ? Number(fee) : period.monthlyFee;
  const scope = `${property.name} · ${new Date(`${month}-01T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
  const technicianNames = [...new Set(period.chemicals.flatMap(chemical => (chemical.technicians || []).map(entry => entry.name)))];

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus();
  }, []);

  function changeChemical(index: number, data: Partial<ConsumptionChemical>) {
    setChemicals(current => current.map((chemical, position) => position === index ? { ...chemical, ...data } : chemical));
  }
  function changeBody(index: number, data: Partial<EditableWaterBody>) {
    setBodies(current => current.map((body, position) => position === index ? { ...body, ...data } : body));
  }
  async function save() {
    setError('');
    let path: string, data: unknown;
    if (mode === 'chemicals' || mode === 'calculation') {
      const invalid = chemicalEditError(chemicals);
      if (invalid) { setError(invalid); return; }
      path = `/${property.id}/${month}/chemicals`;
      data = { chemicals: editableChemicals(chemicals), ...(mode === 'calculation' ? { monthlyFee: Number(fee) } : {}) };
    } else if (mode === 'waterBodies') {
      path = `/${property.id}/water-bodies/edit`;
      data = { waterBodies: bodies };
    } else {
      if (manualTechnician && !technician.trim()) { setError('Enter the technician name.'); return; }
      path = `/${property.id}/${month}/technician`;
      data = { technicianOverride: manualTechnician ? technician.trim() : null };
    }
    setBusy(true);
    try { await onSave(path, data); }
    catch (cause) { setError((cause as Error).message); setBusy(false); }
  }

  return createPortal(<div className="consumption-detail-overlay" onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy} className="consumption-detail-editor" onKeyDown={event => {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') {
        const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]') || [])].filter(element => element.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <header className="cde-header"><div><h2 id={titleId}>{titles[mode]}</h2><p>{scope}</p></div><button type="button" aria-label="Close editor" disabled={busy} onClick={onClose}>×</button></header>
      <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <div className="cde-content">
          {(mode === 'chemicals' || mode === 'calculation') && <>
            <div className="cde-totals">{mode === 'calculation' && <label>Monthly fee ($)<input required type="number" min="0" max="100000000" step="0.01" value={fee} disabled={busy} onChange={event => setFee(event.target.value)} /></label>}<div><span>Total chemical cost</span><strong>{money(total)}</strong></div><div><span>% of monthly fee</span><strong>{effectiveFee && effectiveFee > 0 ? `${(total / effectiveFee * 100).toFixed(1)}%` : 'No monthly fee'}</strong></div></div>
            <p className="cde-help">The percentage is calculated from total chemical cost ÷ monthly fee. Changing a chemical cost adjusts its recorded technician costs proportionally.</p>
            {chemicals.map((chemical, index) => <fieldset key={index} disabled={busy} className="cde-record"><legend>{chemical.name || 'New chemical'}</legend>
              <div className="cde-chemical-fields"><label>Chemical<input aria-label={`Chemical ${index + 1} name`} required maxLength={120} value={chemical.name} onChange={event => changeChemical(index, { name: event.target.value })} /></label><label>Unit<input aria-label={`Chemical ${index + 1} unit`} required maxLength={40} value={chemical.unit} onChange={event => changeChemical(index, { unit: event.target.value })} /></label><label>Quantity<input aria-label={`${chemical.name} quantity`} required type="number" min="0" step="any" value={chemical.quantity} onChange={event => changeChemical(index, { quantity: Number(event.target.value) })} /></label><label>Cost ($)<input aria-label={`${chemical.name} cost`} required type="number" min="0" step="0.01" value={chemical.cost} onChange={event => setChemicals(current => current.map((entry, position) => position === index ? changeChemicalCost(entry, Number(event.target.value)) : entry))} /></label></div>
              <details className="cde-usage"><summary>Technician usage entries ({chemical.technicians?.length || 0})</summary><p className="cde-help">Keep one row per recorded usage. Unassigned quantities remain without a recorded technician.</p>
                {(chemical.technicians || []).map((entry, usageIndex) => <div className="cde-usage-row" key={usageIndex}><label>Technician<input required aria-label={`${chemical.name} usage ${usageIndex + 1} technician`} maxLength={200} value={entry.name} onChange={event => changeChemical(index, { technicians: chemical.technicians!.map((usage, position) => position === usageIndex ? { ...usage, name: event.target.value } : usage) })} /></label><label>Quantity<input required type="number" min="0" step="any" value={entry.quantity} onChange={event => changeChemical(index, { technicians: chemical.technicians!.map((usage, position) => position === usageIndex ? { ...usage, quantity: Number(event.target.value) } : usage) })} /></label><label>Cost ($)<input required type="number" min="0" step="0.01" value={entry.cost} onChange={event => changeChemical(index, { technicians: chemical.technicians!.map((usage, position) => position === usageIndex ? { ...usage, cost: Number(event.target.value) } : usage) })} /></label><button type="button" aria-label={`Remove ${chemical.name} usage ${usageIndex + 1}`} onClick={() => changeChemical(index, { technicians: chemical.technicians!.filter((_, position) => position !== usageIndex) })}>Remove</button></div>)}
                <button type="button" onClick={() => changeChemical(index, { technicians: [...(chemical.technicians || []), { name: '', quantity: 0, cost: 0 }] })}>Add usage entry</button>
              </details><button type="button" className="cde-remove" onClick={() => setChemicals(current => current.filter((_, position) => position !== index))}>Remove chemical</button>
            </fieldset>)}
            <button type="button" disabled={busy} onClick={() => setChemicals(current => [...current, { name: '', unit: 'GAL', quantity: 0, cost: 0 }])}>+ Add chemical</button>
          </>}
          {mode === 'waterBodies' && <><p className="cde-help">These are property records shared by all months. Volumes and active bodies determine allocation. Uncheck Active to retain a body's history.</p>
            {bodies.map((body, index) => <fieldset key={body.id || `new-${index}`} disabled={busy} className="cde-record"><legend>{body.name || 'New water body'}</legend><div className="cde-body-fields">
              <label>Name<input aria-label={`Water body ${index + 1} name`} required maxLength={160} value={body.name} onChange={event => changeBody(index, { name: event.target.value })} /></label>
              <label>Type<select aria-label={`Water body ${index + 1} type`} value={body.type} onChange={event => changeBody(index, { type: event.target.value })}>{bodyTypes.map(type => <option value={type} key={type}>{titleCase(type)}</option>)}</select></label>
              <label>Gallons<input aria-label={`Water body ${index + 1} gallons`} type="number" min="1" step="1" placeholder="Not recorded" value={body.gallons ?? ''} onChange={event => changeBody(index, { gallons: event.target.value === '' ? null : Number(event.target.value) })} /></label>
              <label>Size<select aria-label={`Water body ${index + 1} size`} value={body.size || ''} onChange={event => changeBody(index, { size: event.target.value || null })}><option value="">Not recorded</option>{sizes.map(size => <option key={size} value={size}>{titleCase(size)}</option>)}</select></label>
            </div><label className="cde-check"><input type="checkbox" checked={body.active} onChange={event => changeBody(index, { active: event.target.checked })} />Active</label>{!body.id && <button type="button" className="cde-remove" onClick={() => setBodies(current => current.filter((_, position) => position !== index))}>Remove new body</button>}</fieldset>)}
            <button type="button" disabled={busy} onClick={() => setBodies(current => [...current, { name: '', type: 'POOL', size: null, gallons: null, active: true, technicianName: null }])}>+ Add water body</button>
          </>}
          {mode === 'technician' && <div className="cde-technician"><p className="cde-help">Automatic assignment uses the most usage entries, excluding Georky tank refills. A manual selection applies only to this property and month.</p><label className="cde-check"><input type="checkbox" disabled={busy} checked={manualTechnician} onChange={event => setManualTechnician(event.target.checked)} />Choose technician manually</label>{manualTechnician ? <label>Technician<input required maxLength={200} list={technicianListId} disabled={busy} value={technician} onChange={event => setTechnician(event.target.value)} /></label> : <p>Automatic technician: <strong>{automaticTechnician || 'Not recorded'}</strong></p>}<datalist id={technicianListId}>{technicianNames.map(name => <option key={name} value={name} />)}</datalist></div>}
        </div>
        <footer className="cde-footer">{error && <p role="alert">{error}</p>}<div><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="cde-save" disabled={busy}><WorkspaceIcon name="edit" />{busy ? 'Saving…' : 'Save changes'}</button></div></footer>
      </form>
    </section>
  </div>, document.body);
}
