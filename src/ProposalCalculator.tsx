import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { WorkspaceIcon } from './WorkspaceIcon';
import { proposalServiceOptions } from './proposalServices';
import type { ProposalService } from './proposalServices';
import { defaultSuppliesPerPool, monthlyGasolineLimits } from './proposalCostModel';
import type { CalculatorSettings, ProposalCalculation, ProposalChemicalEstimate, ProposalChemicalSource, ProposalContext, ProposalFuelSettings, ProposalOverheadSettings, ProposalWaterBody } from './proposalCostModel';
import './ProposalCalculator.css';

type Props = {
  sidebar: ReactNode; headerActions: ReactNode;
  property: {
    name: string; addressLine1: string | null; city: string | null; state: string | null; zipCode: string | null;
    formattedAddress?: string | null; latitude?: string | number | null; longitude?: string | number | null;
    managementCompany: { name: string } | null;
  };
  calculation: ProposalCalculation; settings: CalculatorSettings; context: ProposalContext | null; historyLoading: boolean; historyError: string;
  chemicalSource: ProposalChemicalSource; chemicalEstimate: ProposalChemicalEstimate | null; estimateLoading: boolean; estimateError: boolean;
  managementStatus: string; adjustment: string; services: ProposalService[]; notes: string; internalName: string; saving: boolean;
  onUpdate: (index: number, changes: Partial<ProposalWaterBody>) => void; onTarget: (value: number) => void;
  onManagement: (status: string) => void; onAdjustment: (value: string) => void;
  onChemicals: (value: number | null) => void; onServices: (services: ProposalService[]) => void; onNotes: (value: string) => void;
  onSupplies: (value: number | null) => void;
  onFuel: (changes: Partial<ProposalFuelSettings>) => void;
  onOverhead: (field: keyof ProposalOverheadSettings, value: number) => void;
  onInternalName: (value: string) => void;
  onClose: () => void; onReset: () => void; onSave: () => void; onRetryHistory: () => void;
};
const money = (value: number | null) => value === null ? '—' : value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const pct = (value: number | null) => value === null ? '—' : `${value.toFixed(1)}%`;
const label = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/^./, letter => letter.toUpperCase());
const officeAddress = '811 E 131st Ave, Tampa, FL 33612-4424, USA';
const monthLabel = (value: string | null) => value ? new Date(`${value}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
const coreServices: ProposalService[] = ['Chemical Testing & Balancing', 'Skimming', 'Brushing', 'Vacuuming', 'Filter Service', 'Chemical Supply'];

export function ProposalCalculator(props: Props) {
  const { property, calculation: calc, settings, context, services, onUpdate } = props;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { window.scrollTo(0, 0); heading.current?.focus({ preventScroll: true }); }, []);
  const address = [property.addressLine1, property.city, property.state, property.zipCode].map(part => part?.trim()).filter(Boolean).join(', ');
  const latitude = Number(property.latitude);
  const longitude = Number(property.longitude);
  const coordinates = property.latitude != null && property.longitude != null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && (latitude !== 0 || longitude !== 0)
    ? `${latitude},${longitude}` : null;
  const destination = (property.addressLine1?.trim() && address) || property.formattedAddress?.trim() || coordinates;
  const directions = new URLSearchParams({ api: '1', origin: officeAddress, travelmode: 'driving' });
  if (destination) directions.set('destination', destination);
  const directionsUrl = `https://www.google.com/maps/dir/?${directions}`;
  const updateMileage = (miles: number) => props.onFuel({ oneWayMiles: Number.isFinite(miles) ? Math.max(0, miles) : null });
  const management = property.managementCompany?.name ?? 'Not assigned';
  const history = context?.chemicalHistory;
  const included = calc.lines.filter(line => line.body.include);
  const suppliesSource = calc.suppliesPercent === null
    ? 'Monthly supplies cost'
    : `${calc.suppliesPercent.toLocaleString('en-US', { maximumFractionDigits: 2 })}% of final monthly fee`;
  const fuelSource = calc.estimatedGasoline === null
    ? 'Enter distance, vehicle MPG and fuel price'
    : `Min $${monthlyGasolineLimits.minimum} · Max $${monthlyGasolineLimits.maximum} per month`;
  const belowTarget = calc.marginPercent !== null && calc.marginPercent + .01 < settings.targetMarginPercent;
  const scopeChanged = calc.lines.some(line => !line.body.include);
  const chemicalEstimate = props.chemicalEstimate;
  const comparableSource = chemicalEstimate && `${chemicalEstimate.propertyCount} comparable properties · ${chemicalEstimate.recordedMonths} recorded property-months · ${chemicalEstimate.basis === 'GALLONS' ? 'Matched by type and gallons' : 'Matched by type and size · Lower confidence'}`;
  const chemicalSource = {
    EXCLUDED: 'Chemical supply excluded.',
    MANUAL: 'Manual monthly forecast.',
    RECORDED_HISTORY: `Property history · ${history?.months ?? 0} recorded months.`,
    COMPARABLE_PROPERTIES: comparableSource ?? '',
    UNAVAILABLE: props.historyLoading || props.estimateLoading ? 'Looking up chemical costs…'
      : props.estimateError ? 'Comparable properties could not be loaded. Enter a monthly estimate or retry.'
        : props.historyError ? 'Enter a monthly chemical estimate or retry history.'
          : 'Insufficient comparable data. Enter a monthly chemical estimate.',
  }[props.chemicalSource];
  const serviceOption = (service: ProposalService) => <label className="proposal-page-service" key={service}><input type="checkbox" checked={services.includes(service)} onChange={event => props.onServices(proposalServiceOptions.filter(option => option === service ? event.target.checked : services.includes(option)))} /><span>{service}</span></label>;
  const canSave = !props.saving && !props.historyLoading && calc.chemicalCost !== null && calc.estimatedGasoline !== null && included.length > 0 && services.length > 0 && included.every(line => line.costs!.revenue > 0);
  return <div className="page app-page commercial-proposal-page">
    {props.sidebar}
    <main className="proposal-workspace-content" aria-label="Commercial proposal calculator">
      <div className="proposal-page-navigation"><button type="button" onClick={props.onClose} disabled={props.saving}><WorkspaceIcon name="arrow-left" />Back to Commercial</button>{props.headerActions}</div>
      <header className="proposal-page-heading"><span className="proposal-page-heading-icon"><WorkspaceIcon name="reports" /></span><div><h1 ref={heading} tabIndex={-1}>Generate Proposal</h1><p>Pricing Calculator and monthly service proposal.</p></div></header>
      <div className="proposal-page-info"><WorkspaceIcon name="info" /><span>Proposal preview. Service data, property details, and history come from CRM; pricing is based on management assumptions. This preview does not change your CRM data.</span></div>
      <div className="proposal-page-internal-name"><label>Internal proposal name (optional)<input aria-label="Internal proposal name" maxLength={120} value={props.internalName} disabled={props.saving} placeholder="e.g. Pool and fountain · 2027 renewal" onChange={event => props.onInternalName(event.target.value)} /></label><small>Internal use only. Excluded from the PDF and customer email.</small></div>
      <div className="proposal-page-identity">
        {[{ icon: 'properties', title: 'Property', value: property.name }, { icon: 'pin', title: 'Address', value: address || 'Not recorded' }, { icon: 'drop', title: 'Water bodies', value: String(included.length) }, { icon: 'users', title: 'Management Company', value: management }].map(item => <div key={item.title}><WorkspaceIcon name={item.icon as 'properties' | 'pin' | 'drop' | 'users'} /><div><span>{item.title}</span><strong>{item.value}</strong></div></div>)}
      </div>
      <div className="proposal-page-overview">
        <div className="proposal-page-map-panel">
          <div className="proposal-page-map">{destination ? <><iframe title={`Property map for ${property.name}`} src={`https://www.google.com/maps?q=${encodeURIComponent(destination)}&output=embed`} loading="lazy" /><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`} target="_blank" rel="noreferrer">View property on map <WorkspaceIcon name="external" /></a></> : <span>Property location not recorded</span>}</div>
          <div className="proposal-page-map-mileage">
            <label>Office to property (one-way miles)
              <input type="number" min="0" step="0.01" value={settings.fuel.oneWayMiles ?? ''} onChange={event => updateMileage(event.currentTarget.valueAsNumber)} />
            </label>
            <a href={directionsUrl} target="_blank" rel="noreferrer">View route from office <WorkspaceIcon name="external" /></a>
          </div>
        </div>
        <div className="proposal-page-history" aria-live="polite">
          <div><WorkspaceIcon name="calendar" /><div><span>Recorded monthly fee{context?.latestFee ? ` · ${monthLabel(context.latestFee.month)}` : ''}</span><strong>{props.historyLoading ? 'Loading…' : money(context?.latestFee?.monthlyFee ?? null)}</strong></div></div>
          <div><WorkspaceIcon name="chemicals" /><div><span>Recorded chemicals{history?.months ? ` · ${monthLabel(history.from)} – ${monthLabel(history.to)}` : ''}</span><strong>{props.historyLoading ? 'Loading…' : history?.averageMonthlyCost != null ? `${money(history.averageMonthlyCost)} / month` : 'No recorded history'}</strong></div></div>
        </div>
      </div>
      {props.historyError && <p className="proposal-page-alert" role="alert">{props.historyError} <button type="button" onClick={props.onRetryHistory}>Retry history</button></p>}
      <section className="proposal-page-section" aria-labelledby="proposal-services-heading"><div className="proposal-page-section-heading"><div><h2 id="proposal-services-heading">Included Services</h2><p>Define the scope before reviewing costs.</p></div><div className="proposal-page-text-actions"><button type="button" onClick={() => props.onServices([...proposalServiceOptions])}>Select all</button><button type="button" onClick={() => props.onServices([])}>Clear</button></div></div><div className="proposal-page-services">{coreServices.map(serviceOption)}</div><details className="proposal-page-additional"><summary>Additional services · {services.filter(service => !coreServices.includes(service)).length} selected</summary><div className="proposal-page-services">{proposalServiceOptions.filter(service => !coreServices.includes(service)).map(serviceOption)}</div></details></section>
      <section className="proposal-page-section" aria-labelledby="proposal-bodies-heading"><h2 id="proposal-bodies-heading">Water Bodies &amp; Service</h2><p>Inputs from CRM, with editable quote assumptions.</p>
        <div className="proposal-page-bodies">{calc.lines.map((line, index) => {
          const { body, costs } = line;
          return <article className={`proposal-page-body${body.include ? '' : ' is-excluded'}`} key={body.id}>
            <header><div className="proposal-page-body-name"><WorkspaceIcon name={body.type === 'DECORATIVE_WATER_FEATURE' ? 'fountain' : 'pool'} /><label><input type="checkbox" aria-label={`Include ${body.name}`} checked={body.include} onChange={event => onUpdate(index, { include: event.target.checked })} /><strong>{body.name}</strong></label><div className="proposal-page-tags">{body.gallons !== null && <span>{body.gallons.toLocaleString('en-US')} GAL</span>}<span>{body.category ? label(body.category) : 'Size not specified'}</span><span>CRM data</span></div></div><div className="proposal-page-body-price"><span>After management adjustment</span><strong>{costs ? money(costs.revenue) : 'Excluded'}</strong></div></header>
            <fieldset disabled={!body.include} className="proposal-page-fields">
              <label>Size<select aria-label={`Size for ${body.name}`} value={body.category} onChange={event => onUpdate(index, { category: event.target.value })}><option value="">Unspecified size</option>{['SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE'].map(size => <option key={size} value={size}>{label(size)}</option>)}</select></label>
              <label>Visits per week<select aria-label={`Weekly frequency for ${body.name}`} value={body.frequency} onChange={event => onUpdate(index, { frequency: event.target.value })}>{[1, 2, 3, 5, 7].map(visits => <option key={visits} value={`${visits}x Weekly`}>{visits}</option>)}</select></label>
              <label>Quote before management adjustment ($)<input aria-label={`Monthly quoted price for ${body.name}`} type="number" min="1" step="1" value={line.quotePrice} onChange={event => onUpdate(index, { monthlyPrice: Number(event.target.value), priceManuallyAdjusted: true, priceMode: 'CUSTOM' })} /></label>
              <label>Monthly labor cost ($)<input aria-label={`Monthly labor cost for ${body.name}`} type="number" readOnly value={costs?.labor ?? 0} /></label>
              <label>Disinfection system (assumed)<select aria-label={`Disinfection system for ${body.name}`} value={body.disinfectionSystem ? 'YES' : 'NO'} onChange={event => onUpdate(index, { disinfectionSystem: event.target.value === 'YES' })}><option value="YES">Yes</option><option value="NO">No · +5%</option></select></label>
              <label>Access (assumed)<select aria-label={`Access for ${body.name}`} value={body.accessDifficulty} onChange={event => onUpdate(index, { accessDifficulty: event.target.value as ProposalWaterBody['accessDifficulty'] })}><option value="SIMPLE">Simple · no surcharge</option><option value="COMPLEX">Complex · +5%</option></select></label>
            </fieldset>
            {costs && <div className="proposal-page-body-budget"><span>Monthly labor: <b>{money(costs.labor)} ({costs.laborRate * 100}% of final fee)</b></span></div>}
            <details className="proposal-page-body-options"><summary>Body options &amp; price basis</summary><div><label>Body type<select aria-label={`Type for ${body.name}`} value={body.type} onChange={event => onUpdate(index, { type: event.target.value })}>{['SWIMMING_POOL', 'SPA', 'KIDDIE_POOL', 'SPLASH_PAD', 'DECORATIVE_WATER_FEATURE'].map(type => <option key={type} value={type}>{label(type)}</option>)}</select></label><p>Base {money(line.base.categoryBase)} · Frequency ×{line.base.frequency} · Access {line.base.access === 1 ? '0%' : '+5%'} · Disinfection {line.base.disinfection === 1 ? '0%' : '+5%'} · {body.priceManuallyAdjusted ? 'Manual quote' : 'Calculated quote'}.</p><button type="button" onClick={() => onUpdate(index, { priceManuallyAdjusted: false, priceMode: 'SUGGESTED' })}>Use base price</button></div></details>
          </article>;
        })}</div>
        {!calc.lines.length && <p>No water bodies recorded. Add a water body in the property record before creating a proposal.</p>}
      </section>
      <section className="proposal-page-section" aria-labelledby="proposal-management-heading"><div className="proposal-page-section-heading"><div><h2 id="proposal-management-heading">Management Agreement</h2><p>{management} · No automatic discount is assumed.</p></div><span className="proposal-page-assumption"><WorkspaceIcon name="layers" />Commercial simulation</span></div><div className="proposal-page-management">
        <label>Commercial condition<select aria-label="Commercial condition" value={props.managementStatus} onChange={event => props.onManagement(event.target.value)}><option value="CURRENT">No agreement recorded</option><option value="NEGOTIATED">Negotiated discount</option><option value="VIP">VIP · 20% discount</option><option value="SURCHARGE">Negotiated surcharge</option></select></label>
        <label>Adjustment (%)<input aria-label="Management adjustment percentage" type="number" min="0" max="100" step="0.5" disabled={props.managementStatus === 'CURRENT' || props.managementStatus === 'VIP'} value={props.managementStatus === 'VIP' ? 20 : props.adjustment} onChange={event => props.onAdjustment(String(Math.min(100, Math.max(0, Number(event.target.value)))))} /></label>
        <label>Target margin (%)<input aria-label="Target margin percentage" type="number" min="1" max="90" value={settings.targetMarginPercent} onChange={event => props.onTarget(Math.min(90, Math.max(1, Number(event.target.value))))} /></label>
      </div><div className="proposal-page-inline-summary"><span>Before adjustment: <b>{money(calc.subtotal)}</b></span><span>Management adjustment: <b>{money(calc.managementAdjustment)}</b></span><span>After adjustment: <b>{money(calc.total)}</b></span></div></section>
      <section className="proposal-page-section" aria-labelledby="proposal-cost-heading"><h2 id="proposal-cost-heading">Cost &amp; Margin Review</h2><p>Projected chemicals + monthly labor at 20% of the final fee + adjustable overhead.</p>
        <div className="proposal-page-management proposal-page-cost-inputs">
          <label>Projected chemicals / month ($)<input aria-label="Projected chemicals per month" aria-describedby="proposal-chemical-source" type="number" min="0" step="0.01" disabled={!settings.chemicalsIncluded} value={calc.chemicalCost ?? ''} onChange={event => props.onChemicals(Number.isFinite(event.target.valueAsNumber) ? Math.max(0, event.target.valueAsNumber) : null)} /></label>
          <label>Supplies / month ($)<input aria-label="Monthly supplies cost" type="number" min="0" step="0.01" value={calc.supplies} onChange={event => props.onSupplies(Number.isFinite(event.target.valueAsNumber) ? Math.max(0, event.target.valueAsNumber) : null)} /></label>
          <label>Administration (%)<input type="number" min="0" max="100" step="0.01" value={settings.administrationPercent} onChange={event => props.onOverhead('administrationPercent', Math.min(100, Math.max(0, Number(event.target.value))))} /></label>
        </div>
        <p className="proposal-page-forecast-source" id="proposal-chemical-source" aria-live="polite">{chemicalSource} {props.chemicalSource === 'MANUAL' && <button type="button" onClick={() => props.onChemicals(null)}>Reset chemical forecast</button>} {props.estimateError && <button type="button" onClick={props.onRetryHistory}>Retry estimate</button>}</p>
        <div role="group" aria-labelledby="proposal-fuel-heading">
          <h3 id="proposal-fuel-heading">Gasoline</h3>
          <p className="proposal-page-route-source" id="proposal-route-source">
            {destination ? 'Copy the one-way driving distance from Google Maps.' : 'Enter the property address in Google Maps, then copy the one-way driving distance.'}
            {' '}<a href={directionsUrl} target="_blank" rel="noreferrer">View route from office</a>
          </p>
          <div className="proposal-page-management proposal-page-cost-inputs proposal-page-fuel-inputs">
            <label>Office to property (miles)<input aria-describedby="proposal-route-source" type="number" min="0" step="0.01" value={settings.fuel.oneWayMiles ?? ''} onChange={event => updateMileage(event.currentTarget.valueAsNumber)} /></label>
            <label>Fuel price ($/gal)<input type="number" min="0" step="0.01" value={settings.fuel.pricePerGallon ?? ''} onChange={event => props.onFuel({ pricePerGallon: Number.isFinite(event.target.valueAsNumber) ? Math.max(0, event.target.valueAsNumber) : null })} /></label>
            <label>Vehicle efficiency (MPG)<input type="number" min="0.01" step="0.01" value={settings.fuel.milesPerGallon ?? ''} onChange={event => props.onFuel({ milesPerGallon: Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : null })} /></label>
            <label>Trip per visit<select value={settings.fuel.roundTrip ? 'round' : 'one-way'} onChange={event => props.onFuel({ roundTrip: event.target.value === 'round' })}><option value="one-way">One way</option><option value="round">Round trip estimate</option></select></label>
          </div>
          <p className="proposal-page-route-source">{calc.weeklyVisits} {calc.weeklyVisits === 1 ? 'visit' : 'visits'} per week · Gasoline budget {money(monthlyGasolineLimits.minimum)}–{money(monthlyGasolineLimits.maximum)} per month.</p>
        </div>
        <div className="proposal-page-kpis" aria-live="polite">{[{ icon: 'coins', title: 'Final monthly fee', value: money(calc.total) }, { icon: 'tag', title: 'Projected listed costs', value: money(calc.totalCost) }, { icon: 'chart', title: 'Projected profit', value: money(calc.profit) }, { icon: 'percent', title: 'Projected margin', value: pct(calc.marginPercent) }].map(item => <div key={item.title}><WorkspaceIcon name={item.icon as 'coins' | 'tag' | 'chart' | 'percent'} /><div><span>{item.title}</span><strong>{item.value}</strong></div></div>)}</div>
        <div className="proposal-page-table-wrap"><table><thead><tr><th>Cost</th><th>Source / assumption</th><th>Monthly amount</th></tr></thead><tbody>{[
          ['Chemicals', calc.chemicalPercent === null || !settings.chemicalsIncluded ? chemicalSource : `${pct(calc.chemicalPercent)} of final monthly fee`, calc.chemicalCost],
          ['Labor', 'Final monthly fee × 20%', calc.laborCost], ['Supplies', suppliesSource, calc.supplies], ['Administration', `${settings.administrationPercent}% of final fee`, calc.administration], ['Gasoline', fuelSource, calc.estimatedGasoline], ['Total costs', 'Under the assumptions shown above', calc.totalCost],
        ].map(([name, source, amount]) => <tr key={name}><th scope="row">{name}</th><td>{source}</td><td>{money(amount === null ? null : Number(amount))}</td></tr>)}</tbody></table></div>
        <div className={`proposal-page-check ${belowTarget ? 'is-warning' : ''}`} role="status"><WorkspaceIcon name={calc.marginPercent === null ? 'info' : belowTarget ? 'warning' : 'check'} /><span>Target {settings.targetMarginPercent}% · {!calc.targetSupportedByRates ? 'No price reference: the selected expense rates leave no allowance for fixed costs at this target.' : calc.priceReference === 0 ? 'Margin depends on the selected expense rates.' : calc.priceReference !== null ? `Price reference: ${money(calc.priceReference)} / month under these assumptions.` : 'Enter the missing costs to calculate the margin.'} Current margin: {pct(calc.marginPercent)}.</span></div>
        {settings.chemicalsIncluded && calc.chemicalCost !== null && <div className={`proposal-page-check ${calc.overconsumption ? 'is-warning' : ''}`}><WorkspaceIcon name={calc.overconsumption ? 'warning' : 'check'} /><span>Size-based chemical budget benchmark: <b>{money(calc.chemicalBudget)}</b>. Projection: <b>{money(calc.chemicalCost)}</b> · {calc.overconsumption ? 'Above benchmark.' : 'Within benchmark.'}</span></div>}
        {scopeChanged && history?.months ? <p className="proposal-page-alert">History covers the whole property. Review the chemical forecast if the quoted scope differs; recorded costs are not split between water bodies.</p> : null}
        <details className="proposal-page-assumptions"><summary>Price reference and assumptions</summary><p>Small pool base $600; Medium $700; Large $900; Extra large $1,300; Spa $250; Kiddie pool / Splash pad $400; Fountain $150. Unknown pool size uses a $700 price reference and a 20% chemical budget.</p><p>Frequency: 1 visit/week −45%, 2 −20%, 3 base, 5 +35%, 7 +65%. Simple access 0%, Complex +5%; no disinfection system +5%. A change to these assumptions restores the calculated base price. Management adjustments apply afterward; proposal fees round up to whole dollars.</p><p>Chemical budgets: Small 17%, Medium 22%, Large / Extra large 24%, unspecified 20%. Monthly labor = final monthly fee × 20%, after management adjustment. Supplies default to {money(defaultSuppliesPerPool)} per included pool. Clear the supplies field to restore that default. Administration uses the editable percentage above.</p><p>Gasoline uses one trip per property visit. Weekly visits use the highest included service frequency and convert to a monthly average with 52 ÷ 12. The round trip estimate doubles the outbound distance.</p><p>History uses uploaded consumption from the last 12 complete months ({history?.months ?? 0} recorded months available), excluding missing months and the current partial month. The margin includes only the listed costs. Price reference = (chemical forecast + supplies + gasoline) ÷ (1 − target margin − 20% labor − administration), rounded up to $10. The quote stays editable.</p></details>
        <details className="proposal-page-additional"><summary>Proposal notes (optional)</summary><label>Notes included in the proposal<textarea rows={3} value={props.notes} onChange={event => props.onNotes(event.target.value)} /></label></details>
      </section>
      <footer className="proposal-page-footer"><span>Final Monthly Proposal</span><strong>{money(calc.total)} <small>/ month</small></strong><div><button type="button" onClick={props.onReset} disabled={props.saving}>Reset preview</button><button type="button" className="proposal-page-save" onClick={props.onSave} disabled={!canSave}>{props.saving ? 'Saving…' : 'Save Proposal'}</button></div></footer>
    </main>
  </div>;
}
