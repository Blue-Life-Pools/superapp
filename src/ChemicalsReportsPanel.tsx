import { SkimmerVsRegisterSection } from './SkimmerVsRegisterSection';
import { TechnicianChemicalComparisonSection } from './TechnicianChemicalComparisonSection';
import './ChemicalConsumptionPanel.css';
import './ChemicalsReportsPanel.css';

export function ChemicalsReportsPanel() {
  return <div className="chemicals-reports-view">
    <SkimmerVsRegisterSection />
    <TechnicianChemicalComparisonSection />
  </div>;
}
