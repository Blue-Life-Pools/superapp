import { companyChemicalMetrics, companyChemicalStatus, companyReportMonthLabel, type CompanyConsumptionReport } from './chemicalCompanyReport';

const quantity = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });
const percent = (value: number) => `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;

export function CompanyConsumptionChart({ report }: { report: CompanyConsumptionReport }) {
  const scale = report.thresholds.maximum;
  const global = report.scope === 'global';
  const workbookReferences = !!report.maximumReferenceSources?.length;
  return <section className="company-chart" aria-labelledby="company-chart-title">
    <header className="company-chart-heading">
      <h3 id="company-chart-title">Total company — Skimmer vs. estimated maximum · {global ? 'Global' : companyReportMonthLabel(report.month)}</h3>
    </header>
    <div className="company-chart-legend" aria-label="Consumption alert levels">
      <span className="company-legend-normal" title="Within range">&lt; {report.thresholds.warning}%</span>
      <span className="company-legend-warning" title="Early warning">{report.thresholds.warning}% – &lt; {report.thresholds.attention}%</span>
      <span className="company-legend-attention" title="Attention">{report.thresholds.attention}% – {report.thresholds.maximum}%</span>
      <span className="company-legend-high" title="Overconsumption">&gt; {report.thresholds.maximum}%</span>
    </div>
    <div className="company-chart-axis" aria-hidden="true"><span>0%</span><span>{percent(scale)} of maximum</span></div>
    <div className="company-chart-rows">
      {report.chemicals.map((chemical) => {
        const status = companyChemicalStatus(chemical, report.thresholds);
        const usage = companyChemicalMetrics(chemical);
        const manual = chemical.maximumSource === 'MANUAL_COMPANY';
        const workbook = chemical.maximumSource === 'WORKBOOK_PROPERTY';
        const maximum = chemical.maximum === null ? (chemical.populationAdjusted || workbook) && !report.uploadedProperties ? 'Awaiting Skimmer report' : workbook ? 'No workbook reference' : 'Insufficient history' : `${quantity(chemical.maximum)} ${chemical.unit}`;
        const maximumLabel = chemical.populationAdjusted || workbook ? 'Updated maximum' : 'Company maximum';
        const adjustment = workbook ? `Cleaned property maximums from ${report.maximumReferenceSources?.join(', ') || 'the supplied workbook'}. Sum of the properties with uploaded Skimmer data in each month; no extra population multiplier.` : chemical.populationAdjusted && chemical.baseMaximum != null && report.basePropertyCount
          ? `Base maximum: ${quantity(chemical.baseMaximum)} ${chemical.unit}. ${global ? 'Sum of the individually adjusted monthly maximums.' : `${report.uploadedProperties} reported properties / ${report.basePropertyCount} base properties.`}` : undefined;
        const recorded = chemical.recordedQuantity === null ? global ? 'No data for included months' : 'No data for this month' : `${quantity(chemical.recordedQuantity)} ${chemical.unit}`;
        return <article className={`company-chart-row company-chart-${status.level}`} key={chemical.id}>
          <div className="company-chart-row-heading"><h4>{chemical.name} <small>({chemical.unit})</small></h4><p>Skimmer total: <strong>{recorded}</strong><span aria-hidden="true"> | </span><span title={adjustment}>{maximumLabel}: <strong>{maximum}{manual && ' (manual)'}</strong></span></p></div>
          <div className="company-chart-track" role="img" aria-label={`${chemical.name}: Skimmer total ${recorded}; ${maximumLabel.toLowerCase()} ${maximum}${usage.percent === null ? '' : `; ${percent(usage.percent)} of company maximum`}. ${status.label}.`}>
            {usage.percent !== null && <>
              <div className="company-chart-fill" style={{ width: `${Math.min(100, Math.max(0, usage.percent / scale * 100))}%` }}>
                {usage.percent / scale >= .12 && <span>{percent(usage.percent)}</span>}
              </div>
              {usage.percent / scale < .12 && <span className="company-chart-value">{percent(usage.percent)}</span>}
            </>}
            <span className="company-chart-marker company-chart-marker-warning" style={{ left: `${report.thresholds.warning / scale * 100}%` }} title={`${report.thresholds.warning}% — Early warning`} />
            <span className="company-chart-marker company-chart-marker-attention" style={{ left: `${report.thresholds.attention / scale * 100}%` }} title={`${report.thresholds.attention}% — Attention`} />
            <span className="company-chart-marker company-chart-marker-maximum" style={{ left: `${report.thresholds.maximum / scale * 100}%` }} title={`${report.thresholds.maximum}% — ${manual ? 'Company maximum' : 'Estimated maximum'}`} />
          </div>
          {chemical.georkyRefillQuantity > 0 && <p className="company-chart-coverage">Included in Skimmer total — Georky tank refill: {quantity(chemical.georkyRefillQuantity)} {chemical.unit}.</p>}
          {!!chemical.properties.length && <details className="company-chart-details"><summary>View property breakdown ({chemical.properties.length})</summary>
            <div className="company-chart-table-wrap"><table><thead><tr><th>Property</th>{global && <th>{manual ? 'Reported months' : 'Reported / reference months'}</th>}<th>Skimmer ({chemical.unit})</th>{!manual && <><th>{chemical.populationAdjusted ? 'Base maximum' : 'Maximum'} ({chemical.unit})</th><th>Excess ({chemical.unit})</th></>}</tr></thead><tbody>{chemical.properties.map((property) => <tr key={property.propertyId}>
              <th scope="row">{property.propertyName}</th>
              {global && <td>{manual ? property.reportedMonths ?? 0 : `${property.reportedMonths ?? 0} / ${property.referenceMonths ?? 0}`}</td>}
              <td>{property.recordedQuantity === null ? 'No report' : quantity(property.recordedQuantity)}</td>
              {!manual && <><td>{property.maximum === null ? 'No reference' : quantity(property.maximum)}</td>
              <td>{property.recordedQuantity === null || property.maximum === null ? '—' : quantity(Math.max(0, property.recordedQuantity - property.maximum))}</td></>}
            </tr>)}</tbody></table></div>
          </details>}
        </article>;
      })}
    </div>
    <details className="company-chart-method"><summary>How the maximum and alerts are calculated</summary>
      {workbookReferences ? <>
        <p>Property maximums use the supplied 2025–2026 workbook's cleaned monthly maximum, not its observed maximum. Equivalent product names, such as Liquid and Liquid Chlorine, use a single maximum per property and unit: the larger cleaned maximum, never their sum. The workbook's excluded outliers are not added back and its references do not require 9 months of consumption.</p>
        <p>Each monthly company maximum sums the matched property maximums for the unique properties in that month's uploaded Skimmer report. New properties use their own workbook maximum, when available; no additional 253-property multiplier, seasonal factor or day adjustment is applied. Properties or chemicals missing from the workbook remain without an individual reference. Products absent from the workbook retain their previous company reference.</p>
        {report.maximumReferenceSources?.map((source) => <p key={source}>Maximum source: {source}</p>)}
      </> : <>
      <p>For chemicals with sufficient history, the {report.baselineYear} history excludes marked outliers, normalizes quantities by days and seasonality, and estimates each property's monthly maximum as the normalized mean plus 3 standard deviations, adjusted to each selected month. A reliable reference requires at least 9 recorded months, 9 months with consumption and 6 retained observations. These are the same historical rules used in Property consumption.</p>
      <p>Manual base monthly company maximums: Stabilizer 412 scoops, Chlorine Powder 190 scoops, Bicarbonate 170 scoops, Salt 13 bags and Phosphates 70 oz. These limits compare all uploaded consumption for that chemical, without requiring a property history match. They are company totals, not individual property allowances, and are not adjusted for days or seasonality. In Global, one monthly limit is added for each included month.</p>
      {!!report.basePropertyCount && <>
        <p>Updated maximum = base monthly company maximum × unique properties with uploaded Skimmer data for that month ÷ {report.basePropertyCount} properties in the {report.baselineYear} base. The same population factor applies once to both historical and manual company maximums. Properties without a report for that month do not increase its maximum. Individual property references remain unchanged. In Global, each month's updated maximum is calculated first, then summed.</p>
        {!!report.monthlyPropertyCounts?.length && <div className="company-chart-table-wrap"><table><thead><tr><th>Month</th><th>Reported properties</th><th>Base properties</th></tr></thead><tbody>{report.monthlyPropertyCounts.map((item) => <tr key={item.month}><th scope="row">{companyReportMonthLabel(item.month)}</th><td>{item.properties}</td><td>{report.basePropertyCount}</td></tr>)}</tbody></table></div>}
      </>}
      </>}
      <p>The percentage is Skimmer total divided by the displayed company maximum, multiplied by 100. Excess is Skimmer total minus that same maximum when positive. Missing references can leave the available company maximum incomplete. Reference data is used only for the maximum, never as a substitute for an uploaded Skimmer report.</p>
      {global && <p>Global includes every month with uploaded Skimmer data, even across years. Quantities and company maximums are summed separately. The percentage is total Skimmer usage divided by the total company maximum, not an average of monthly percentages. Global excess is the net excess over the combined maximum; a month with lower consumption can offset another month's excess.</p>}
      <p>At {report.thresholds.warning}% review usage; at {report.thresholds.attention}% follow up before reaching the limit; above {report.thresholds.maximum}% investigate the excess. These marks compare recorded usage with the maximum for the included periods, without projecting the rest of a month. A company total can hide individual property excesses; open a property breakdown to review those.</p>
    </details>
  </section>;
}
