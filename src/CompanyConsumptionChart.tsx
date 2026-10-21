import { companyChartScale, companyChemicalStatus, companyReportMonthLabel, type CompanyConsumptionReport } from './chemicalCompanyReport';

const quantity = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });
const percent = (value: number) => `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;

export function CompanyConsumptionChart({ report }: { report: CompanyConsumptionReport }) {
  const scale = companyChartScale(report.chemicals);
  const global = report.scope === 'global';
  return <section className="company-chart" aria-labelledby="company-chart-title">
    <header className="company-chart-heading">
      <h3 id="company-chart-title">Total company — Skimmer vs. estimated maximum · {global ? 'Global' : companyReportMonthLabel(report.month)}</h3>
      <p>{global ? 'Global maximum = sum of the monthly maximums for the included months.' : 'Monthly maximum = sum of each active property’s reliable estimate.'} Each estimate uses {report.baselineYear} history, adjusted for the corresponding month's days and seasonal factor where available.</p>
      <p>Company totals include all uploaded usage. Bars compare Skimmer with the maximum for the same properties: only those with both a reliable reference and an uploaded report.</p>
    </header>
    <div className="company-chart-legend" aria-label="Consumption alert levels">
      <span className="company-legend-normal">Below {report.thresholds.warning}%: within range*</span>
      <span className="company-legend-warning">{report.thresholds.warning}%: early warning</span>
      <span className="company-legend-attention">{report.thresholds.attention}%: attention</span>
      <span className="company-legend-high">Above {report.thresholds.maximum}%: overconsumption</span>
    </div>
    <p className="company-chart-note">The dashed line marks 100% of the comparable maximum. *“Within range” for the company requires complete coverage. These are monthly usage review thresholds, not chemical dosing targets. Each chemical uses its own unit.</p>
    <div className="company-chart-axis" aria-hidden="true"><span>0%</span><span>{percent(scale)} of comparable maximum</span></div>
    <div className="company-chart-rows">
      {report.chemicals.map((chemical) => {
        const status = companyChemicalStatus(chemical, report.thresholds);
        const maximum = chemical.maximum === null ? 'Insufficient history' : `${quantity(chemical.maximum)} ${chemical.unit}`;
        const recorded = chemical.recordedQuantity === null ? global ? 'No data for included months' : 'No data for this month' : `${quantity(chemical.recordedQuantity)} ${chemical.unit}`;
        return <article className={`company-chart-row company-chart-${status.level}`} key={chemical.id}>
          <div className="company-chart-row-heading"><h4>{chemical.name} <small>({chemical.unit})</small></h4><p>Skimmer total: <strong>{recorded}</strong><span aria-hidden="true"> | </span>Company maximum: <strong>{maximum}</strong></p></div>
          {chemical.comparableQuantity !== null && chemical.comparisonMaximum !== null && <p className="company-chart-coverage">Compared: {quantity(chemical.comparableQuantity)} {chemical.unit} Skimmer / {quantity(chemical.comparisonMaximum)} {chemical.unit} maximum · {chemical.reportedReferenceProperties} properties.</p>}
          <div className="company-chart-track" role="img" aria-label={`${chemical.name}: Skimmer total ${recorded}; company maximum ${maximum}${chemical.percent === null ? '' : `; comparable Skimmer ${quantity(chemical.comparableQuantity!)} ${chemical.unit}; comparable maximum ${quantity(chemical.comparisonMaximum!)} ${chemical.unit}; ${percent(chemical.percent)} of comparable maximum`}. ${status.label}.`}>
            {chemical.percent !== null && <div className="company-chart-fill" style={{ width: `${Math.min(100, Math.max(0, chemical.percent / scale * 100))}%` }}>
              {chemical.percent / scale >= .12 && <span>{percent(chemical.percent)}</span>}
            </div>}
            <span className="company-chart-marker company-chart-marker-warning" style={{ left: `${report.thresholds.warning / scale * 100}%` }} title={`${report.thresholds.warning}% — Early warning`} />
            <span className="company-chart-marker company-chart-marker-attention" style={{ left: `${report.thresholds.attention / scale * 100}%` }} title={`${report.thresholds.attention}% — Attention`} />
            <span className="company-chart-marker company-chart-marker-maximum" style={{ left: `${report.thresholds.maximum / scale * 100}%` }} title={`${report.thresholds.maximum}% — Estimated maximum`} />
          </div>
          <div className="company-chart-row-summary">
            <strong>{chemical.percent === null ? status.label : `${percent(chemical.percent)} of comparable maximum · ${status.label}`}</strong>
            {chemical.comparableQuantity !== null && chemical.comparisonMaximum !== null && <span>{chemical.excessQuantity! > 0 ? `Exceeds comparable maximum by ${quantity(chemical.excessQuantity!)} ${chemical.unit}` : `${quantity(chemical.remainingQuantity!)} ${chemical.unit} below the comparable maximum`}</span>}
          </div>
          <p className="company-chart-coverage">Reference: {chemical.referenceProperties} properties · Uploaded reports: {chemical.reportedReferenceProperties}/{chemical.referenceProperties} reference properties{chemical.unreferencedProperties > 0 ? ` · ${quantity(chemical.unreferencedQuantity)} ${chemical.unit} from ${chemical.unreferencedProperties} properties without a reliable reference` : ''}.</p>
          {global && <p className="company-chart-coverage">Reported property-months: {chemical.reportedReferencePropertyMonths ?? 0}/{chemical.referencePropertyMonths ?? 0}. Each property's month is compared only when its report is available.</p>}
          {!chemical.coverageComplete && chemical.recordedQuantity !== null && <p className="company-chart-incomplete">Partial coverage: usage without a reference and properties without a report are excluded from the bar comparison. A low percentage does not confirm company-wide savings.</p>}
          {chemical.georkyRefillQuantity > 0 && <p className="company-chart-coverage">Included in Skimmer total — Georky tank refill: {quantity(chemical.georkyRefillQuantity)} {chemical.unit}.</p>}
          {!!chemical.properties.length && <details className="company-chart-details"><summary>View property breakdown ({chemical.properties.length})</summary>
            <div className="company-chart-table-wrap"><table><thead><tr><th>Property</th>{global && <th>Reported / reference months</th>}<th>Skimmer ({chemical.unit})</th><th>{global ? 'Comparable maximum' : 'Maximum'} ({chemical.unit})</th><th>Excess ({chemical.unit})</th></tr></thead><tbody>{chemical.properties.map((property) => <tr key={property.propertyId}>
              <th scope="row">{property.propertyName}</th>
              {global && <td>{property.reportedMonths ?? 0} / {property.referenceMonths ?? 0}</td>}
              <td>{property.recordedQuantity === null ? 'No report' : quantity(property.recordedQuantity)}</td>
              <td>{global ? property.comparisonMaximum == null ? property.maximum === null ? 'No reference' : 'No report' : quantity(property.comparisonMaximum) : property.maximum === null ? 'No reference' : quantity(property.maximum)}</td>
              <td>{global ? property.comparableQuantity == null || property.comparisonMaximum == null ? '—' : quantity(Math.max(0, property.comparableQuantity - property.comparisonMaximum)) : property.recordedQuantity === null || property.maximum === null ? '—' : quantity(Math.max(0, property.recordedQuantity - property.maximum))}</td>
            </tr>)}</tbody></table></div>
          </details>}
        </article>;
      })}
    </div>
    <details className="company-chart-method"><summary>How the maximum and alerts are calculated</summary>
      <p>For each uniquely matched property and chemical, the {report.baselineYear} history excludes marked outliers, normalizes quantities by days and seasonality, and estimates the monthly maximum as the normalized mean plus 3 standard deviations, adjusted to each selected month. A reliable reference requires at least 9 recorded months, 9 months with consumption and 6 retained observations. These are the same historical rules used in Property consumption; manual overrides are not used in this chart.</p>
      <p>The company maximum adds these property maximums separately for each chemical and unit for each included month, including properties without an uploaded report in that month. Skimmer total is all uploaded PDF usage for active properties in the selected period. Each bar and its excess use the same property-month pairs on both sides: a reliable reference and an uploaded report. With complete coverage, that is the full company comparison. Archived {report.baselineYear} data is used only for the estimate, never as a substitute for an uploaded Skimmer report. Missing history is not estimated as zero.</p>
      {global && <p>Global includes every month with uploaded Skimmer data, even across years. Quantities and monthly maximums are summed separately. The percentage is total comparable usage divided by total comparable maximum, not an average of monthly percentages. Months without reports for a property do not add allowance to its comparable maximum. Global excess is the net excess over the combined maximum; a month with lower consumption can offset another month's excess.</p>}
      <p>At {report.thresholds.warning}% review usage; at {report.thresholds.attention}% follow up before reaching the limit; above {report.thresholds.maximum}% investigate the excess. These marks compare recorded usage with the maximum for the included periods, without projecting the rest of a month. A company total can hide individual property excesses; open a property breakdown to review those.</p>
    </details>
  </section>;
}
