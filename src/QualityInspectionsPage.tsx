import { SearchField } from './SearchField';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { API_URL, apiFetch as fetch } from "./api";
import { qualityFindingsPayload, qualityVisitInput, qualityVisitInstant } from "./qualityInspectionPayload";
import { filterQualityInspections, qualityDateBasis, type QualityDateBasis } from "./qualityInspectionFilters";
import { WorkspaceIcon } from './WorkspaceIcon';
import { WorkspaceActionsMenu } from './WorkspaceActionsMenu';
import { QualityPeriodReport } from './QualityPeriodReport';
import './QualityInspectionsPage.css';

type WaterBody = { id: string; name: string; type: string; active?: boolean };
type Property = { id: string; name: string; waterBodies: WaterBody[] };
type Photo = { name: string; type: string; data: string };
type Finding = {
  id?: string;
  title?: string;
  description: string;
  severity: string;
  status: string;
  responsibleName?: string | null;
  requiresEstimate: boolean;
  resolution?: string | null;
  resolvedAt?: string | null;
  resolvedByName?: string | null;
  resolutionUpdatedByName?: string | null;
  estimateNumber?: string | null;
  estimateSentAt?: string | null;
  photos: Photo[];
  photosChanged?: boolean;
};
export type Inspection = {
  id: string;
  propertyId: string;
  waterBodyId?: string | null;
  technicianName: string;
  visitDate: string;
  readings: Record<string, string> | null;
  dosages: Record<string, string> | null;
  notes: string | null;
  photos: Photo[];
  property: { id: string; name: string };
  waterBody?: { id: string; name: string } | null;
  findings: Finding[];
};
type Form = {
  propertyId: string;
  waterBodyId: string;
  technicianName: string;
  visitDate: string;
  ph: string;
  chlorine: string;
  alkalinity: string;
  stabilizer: string;
  salt: string;
  temperature: string;
  phosphates: string;
  calcium: string;
  saturationIndex: string;
  chlorineDosage: string;
  acidDosage: string;
  algaecideDosage: string;
  shockDosage: string;
  stabilizerDosage: string;
  otherDosage: string;
  notes: string;
  findings: Finding[];
  photos: Photo[];
};
function formFromInspection(item: Inspection): Form {
  const readings = item.readings || {};
  const dosages = item.dosages || {};
  return {
    ...emptyForm(),
    propertyId: item.propertyId,
    waterBodyId: item.waterBodyId || "",
    technicianName: item.technicianName,
    visitDate: qualityVisitInput(item.visitDate),
    ph: readings.pH || "",
    chlorine: readings.Chlorine || "",
    alkalinity: readings.Alkalinity || "",
    stabilizer: readings.Stabilizer || "",
    salt: readings.Salt || "",
    temperature: readings.Temperature || "",
    phosphates: readings.Phosphates || "",
    calcium: readings.Calcium || "",
    saturationIndex: readings["Saturation index"] || "",
    chlorineDosage: dosages.Chlorine || "",
    acidDosage: dosages.Acid || "",
    algaecideDosage: dosages.Algaecide || "",
    shockDosage: dosages.Shock || "",
    stabilizerDosage: dosages.Stabilizer || "",
    otherDosage: dosages.Other || "",
    notes: item.notes || "",
    findings: item.findings.map((finding) => ({ ...finding, photos: finding.photos || [] })),
    photos: item.photos || [],
  };
}

function QualityReadings({ readings }: { readings: Record<string, string> | null }) {
  const scroll = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });
  const entries = Object.entries(readings || {}).filter(([, value]) => value);
  const order = ['pH', 'Chlorine', 'Alkalinity', 'Phosphates', 'Stabilizer'];
  entries.sort(([a], [b]) => (order.includes(a) ? order.indexOf(a) : 99) - (order.includes(b) ? order.indexOf(b) : 99));
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const update = () => setCanScroll({ left: element.scrollLeft > 2, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 2 });
    element.scrollLeft = 0; update();
    const observer = new ResizeObserver(update); observer.observe(element);
    element.addEventListener('scroll', update);
    return () => { observer.disconnect(); element.removeEventListener('scroll', update); };
  }, [readings]);
  return <div className="quality-readings-strip" aria-label="Inspection readings"><strong>Readings</strong><div className="quality-readings-scroll" ref={scroll}>
    {entries.length ? entries.map(([key, value]) => <div key={key} className={readingCardClass(key, value)} title={chemicalAlerts({ [key]: value })[0]?.message || readingLabels[key] || key}><span>{shortReadingLabels[key] || key}</span><strong>{value}{Number.isFinite(Number(value)) && readingUnits[key] && <small>{readingUnits[key]}</small>}</strong></div>) : <p>No readings recorded.</p>}
  </div>{(canScroll.left || canScroll.right) && <div className="quality-readings-arrows"><button type="button" aria-label="Previous readings" disabled={!canScroll.left} onClick={() => scroll.current?.scrollBy({ left: -240, behavior: 'smooth' })}><WorkspaceIcon name="chevron-left" /></button><button type="button" aria-label="More readings" disabled={!canScroll.right} onClick={() => scroll.current?.scrollBy({ left: 240, behavior: 'smooth' })}><WorkspaceIcon name="chevron-right" /></button></div>}</div>;
}

const emptyFinding = (): Finding => ({
  title: "Finding",
  description: "",
  severity: "MEDIUM",
  status: "OPEN",
  requiresEstimate: false,
  resolution: "",
  photos: [],
});
const emptyForm = (): Form => ({
  propertyId: "",
  waterBodyId: "",
  technicianName: "",
  visitDate: qualityVisitInput(new Date().toISOString()),
  ph: "",
  chlorine: "",
  alkalinity: "",
  stabilizer: "",
  salt: "",
  temperature: "",
  phosphates: "",
  calcium: "",
  saturationIndex: "",
  chlorineDosage: "",
  acidDosage: "",
  algaecideDosage: "",
  shockDosage: "",
  stabilizerDosage: "",
  otherDosage: "",
  notes: "",
  findings: [],
  photos: [],
});
const range = (start: number, end: number, step: number) => Array.from({ length: Math.round((end - start) / step) + 1 }, (_, index) => (start + index * step).toFixed(step < 1 ? 2 : 0).replace(/\.00$/, ""));
const saltValues = ["0", "390", "450", "510", "570", "630", "700", "770", "850", "930", "1020", "1110", "1210", "1320", "1430", "1550", "1680", "1830", "1980", "2150", "2330", "2520", "2740", "2980", "3240", "3530", "3850", "4210", "4610", "5070", "5600", "6200", "6910", "7730"];
const saturationValues = ["-0.3", "-0.25", "-0.2", "-0.15", "-0.1", "-0.05", "-0.01", "0", "0.01", "0.05", "0.1", "0.15", "0.2", "0.25", "0.3"];
const readingFields: Array<[keyof Form, string, string[]]> = [
  ["ph", "pH", range(6, 9, 0.1)], ["chlorine", "Chlorine (ppm)", range(0, 10, 1)], ["alkalinity", "Alkalinity (ppm)", range(0, 300, 10)],
  ["stabilizer", "Stabilizer (ppm)", range(0, 200, 10)], ["salt", "Salt (ppm)", saltValues], ["temperature", "Water temperature (°F)", range(80, 110, 1)],
  ["phosphates", "Phosphates (ppb)", ["0", "100", "200", "300", "500", "1000"]], ["calcium", "Calcium (ppm)", ["1", "300", "400", "500"]], ["saturationIndex", "Saturation index", saturationValues],
];
const dosageFields: Array<[keyof Form, string]> = [["chlorineDosage", "Chlorine"], ["acidDosage", "Acid"], ["algaecideDosage", "Algaecide"], ["shockDosage", "Shock"], ["stabilizerDosage", "Stabilizer"], ["otherDosage", "Other"]];
const readingLabels: Record<string, string> = { pH: "pH", Chlorine: "Chlorine (ppm)", Alkalinity: "Alkalinity (ppm)", Stabilizer: "Stabilizer (ppm)", Salt: "Salt (ppm)", Temperature: "Water temperature (°F)", Phosphates: "Phosphates (ppb)", Calcium: "Calcium (ppm)", "Saturation index": "Saturation index" };
const dosageLabels: Record<string, string> = { Chlorine: "Chlorine", Acid: "Acid", Algaecide: "Algaecide", Shock: "Shock", Stabilizer: "Stabilizer", Other: "Other" };
type ReadingAlertLevel = "normal" | "warning" | "alert";
type ChemicalAlert = { key: string; label: string; value: number; message: string; level: ReadingAlertLevel };

function chemicalAlertLevel(key: string, value: number): ReadingAlertLevel {
  if (key === "pH") return value < 7 || value > 7.8 ? "alert" : value < 7.1 || value > 7.7 ? "warning" : "normal";
  if (key === "Chlorine") return value === 0 || value > 7 ? "alert" : value <= 1 || value >= 6 ? "warning" : "normal";
  if (key === "Salt") return value > 4500 ? "alert" : value >= 4000 ? "warning" : "normal";
  if (key === "Calcium") return value > 500 ? "alert" : value >= 450 ? "warning" : "normal";
  if (key === "Alkalinity") return value < 80 || value > 120 ? "alert" : value < 90 || value > 110 ? "warning" : "normal";
  if (key === "Phosphates") return value > 300 ? "alert" : value >= 200 ? "warning" : "normal";
  if (key === "Stabilizer") return value < 30 || value > 60 ? "alert" : value < 40 || value > 50 ? "warning" : "normal";
  if (key === "Saturation index") return value < -0.3 || value > 0.3 ? "alert" : value <= -0.25 || value >= 0.25 ? "warning" : "normal";
  if (key === "Temperature") return value > 104 ? "alert" : value >= 101 ? "warning" : "normal";
  return "normal";
}

function chemicalAlerts(readings: Record<string, string>): ChemicalAlert[] {
  return Object.entries(readings).flatMap(([key, rawValue]) => {
    const value = Number(rawValue);
    if (!rawValue || !Number.isFinite(value)) return [];
    const level = chemicalAlertLevel(key, value);
    if (level === "normal") return [];
    const label = readingLabels[key] || key;
    const message = key === "pH" ? `${label}: ${value} (target 7.0–7.8)`
      : key === "Chlorine" ? `${label}: ${value} (target 1–7)`
        : key === "Salt" ? `${label}: ${value} (alert above 4500)`
          : key === "Calcium" ? `${label}: ${value} (alert above 500)`
            : key === "Alkalinity" ? `${label}: ${value} (target 80–120)`
              : key === "Phosphates" ? `${label}: ${value} (alert above 300)`
                : key === "Stabilizer" ? `${label}: ${value} (target 30–60)`
                  : key === "Saturation index" ? `${label}: ${value} (target -0.3 to 0.3)`
                    : `${label}: ${value} (alert above 104°F)`;
    return [{ key, label, value, message, level }];
  });
}

function readingCardClass(key: string, value: string) {
  const level = Number.isFinite(Number(value)) ? chemicalAlertLevel(key, Number(value)) : "normal";
  return `quality-reading-metric quality-reading-level-${level}`;
}

const readingUnits: Record<string, string> = { Chlorine: 'ppm', Alkalinity: 'ppm', Phosphates: 'ppb', Stabilizer: 'ppm', Salt: 'ppm', Calcium: 'ppm', Temperature: '°F' };
const shortReadingLabels: Record<string, string> = { Stabilizer: 'Stabilizer (CYA)', Temperature: 'Temperature' };
const waterBodyTypes: Record<string, string> = { SWIMMING_POOL: 'Pool', SPA: 'Spa', KIDDIE_POOL: 'Kiddie pool', SPLASH_PAD: 'Splash pad', DECORATIVE_WATER_FEATURE: 'Fountain', UNSPECIFIED: 'Type not recorded' };
function visitLabel(value: string) {
  const date = new Date(value);
  return `${date.toLocaleDateString('en-US', { timeZone: 'America/Bogota', month: 'short', day: 'numeric', year: 'numeric' })} · ${date.toLocaleTimeString('en-US', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })}`;
}
function visitSeverity(item: Inspection) {
  return item.findings.some((finding) => finding.severity === 'HIGH') ? 'HIGH' : item.findings.some((finding) => finding.severity === 'MEDIUM') ? 'MEDIUM' : item.findings.length ? 'LOW' : null;
}

function signal(finding: Finding) {
  return finding.status === "RESOLVED"
    ? "green"
    : finding.severity === "HIGH"
      ? "red"
      : "yellow";
}
function severityLabel(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
function dateLabel(value: string) {
  return new Date(value).toLocaleString("en-US", {
    timeZone: "America/Bogota",
  });
}
async function fileData(file: File): Promise<Photo> {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  if (!file.type.startsWith("image/"))
    return { name: file.name, type: file.type, data: source };
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Could not read image."));
    element.src = source;
  });
  const scale = Math.min(
    1,
    1600 / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    name: file.name,
    type: "image/jpeg",
    data: canvas.toDataURL("image/jpeg", 0.8),
  };
}

export function QualityInspectionsPage({
  sidebar,
  properties,
  isSuperAdmin,
}: {
  sidebar: ReactNode;
  properties: Property[];
  isSuperAdmin: boolean;
}) {
  const [items, setItems] = useState<Inspection[]>([]);
  const [editing, setEditing] = useState<Form | null>(null);
  const [directorySearch, setDirectorySearch] = useState("");
  const [propertySearch, setPropertySearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [originalFindings, setOriginalFindings] = useState<Finding[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [dashboardFilter, setDashboardFilter] = useState("ALL");
  const [propertyFilter, setPropertyFilter] = useState("ALL");
  const [technicianFilter, setTechnicianFilter] = useState("ALL");
  const [findingStatusFilter, setFindingStatusFilter] = useState("ALL");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [estimateFilter, setEstimateFilter] = useState("ALL");
  const [dateFilterMode, setDateFilterMode] = useState("ALL");
  const [dateFilterBasis, setDateFilterBasis] = useState<QualityDateBasis>("AUTO");
  const [dateFilterDay, setDateFilterDay] = useState("");
  const [dateFilterFrom, setDateFilterFrom] = useState("");
  const [dateFilterTo, setDateFilterTo] = useState("");
  const [waterBodyTypeFilter, setWaterBodyTypeFilter] = useState('ALL');
  const [selectedInspectionId, setSelectedInspectionId] = useState('');
  const [visitPage, setVisitPage] = useState(0);
  const [activeTab, setActiveTab] = useState<'findings' | 'dosages' | 'notes'>('findings');
  const [moreFilters, setMoreFilters] = useState(false);
  const [expandedFindingId, setExpandedFindingId] = useState<string | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState('');
  const [detailError, setDetailError] = useState('');
  const [detailAttempt, setDetailAttempt] = useState(0);
  const loadedInspectionIds = useRef(new Set<string>());
  const [periodReportOpen, setPeriodReportOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [technicians, setTechnicians] = useState<string[]>([]);
  const [resolvingFinding, setResolvingFinding] = useState<{ finding: Finding; inspection: Inspection } | null>(null);
  const [resolveForm, setResolveForm] = useState({ resolution: "", resolvedAt: new Date().toISOString().slice(0, 10), responsibleName: "", requiresEstimate: false, estimateNumber: "", estimateSentAt: "" });
  const [resolveConfirmed, setResolveConfirmed] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<Photo | null>(null);
  async function load() {
    const response = await fetch(`${API_URL}/quality-inspections`);
    if (!response.ok) throw new Error("Could not load quality inspections.");
    setItems((await response.json()) as Inspection[]);
  }
  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    async function loadTechnicians() {
      const reportsResponse = await fetch(`${API_URL}/reports/people`);
      const names = new Set<string>();
      const addTechnicianName = (value?: string) => {
        const name = value?.trim();
        if (name && !/^\d/.test(name)) names.add(name);
      };
      if (reportsResponse.ok) {
        const people = await reportsResponse.json() as Array<{ name?: string; role?: string }>;
        people.filter((person) => person.role === "TECHNICIAN").forEach((person) => addTechnicianName(person.name));
      }
      setTechnicians([...names].sort((a, b) => a.localeCompare(b)));
    }
    void loadTechnicians().catch(() => setTechnicians([]));
  }, []);
  const bodyTypeById = useMemo(() => new Map(properties.flatMap((property) => property.waterBodies.map((body) => [body.id, body.type] as const))), [properties]);
  const inspectionBodyType = (item: Inspection) => bodyTypeById.get(item.waterBodyId || item.waterBody?.id || '') || 'UNSPECIFIED';
  const typeOptions = [...new Set(items.map(inspectionBodyType))].sort();
  const technicianOptions = [...new Set([...technicians, ...items.map((item) => item.technicianName).filter(Boolean)])].sort((a, b) => a.localeCompare(b));
  const qualityFilteredItems = useMemo(
    () => filterQualityInspections(items.filter((item) => (waterBodyTypeFilter === 'ALL' || inspectionBodyType(item) === waterBodyTypeFilter) && (!directorySearch.trim() || [item.property?.name, item.technicianName].some((value) => value?.toLowerCase().includes(directorySearch.trim().toLowerCase())))), {
      property: propertyFilter, technician: technicianFilter, status: findingStatusFilter,
      severity: severityFilter, estimate: estimateFilter, dashboard: dashboardFilter,
      dateBasis: dateFilterBasis, dateMode: dateFilterMode, day: dateFilterDay, from: dateFilterFrom, to: dateFilterTo,
    }),
    [directorySearch, dashboardFilter, dateFilterBasis, dateFilterDay, dateFilterFrom, dateFilterMode, dateFilterTo, estimateFilter, findingStatusFilter, items, propertyFilter, severityFilter, technicianFilter, waterBodyTypeFilter, bodyTypeById],
  );
  const activeDateBasis = qualityDateBasis({ dateBasis: dateFilterBasis, dashboard: dashboardFilter, status: findingStatusFilter });
  const allFindings = useMemo(() => qualityFilteredItems.flatMap((inspection) => inspection.findings), [qualityFilteredItems]);
  const dashboardCounts = { all: allFindings.length, pending: allFindings.filter((finding) => finding.status !== "RESOLVED").length, solved: allFindings.filter((finding) => finding.status === "RESOLVED").length, estimate: allFindings.filter((finding) => finding.requiresEstimate).length };
  const dashboardItems = dashboardFilter === "ALL" ? qualityFilteredItems : qualityFilteredItems.filter((inspection) => inspection.findings.some((finding) => dashboardFilter === "ESTIMATE" ? finding.requiresEstimate : dashboardFilter === "PENDING" ? finding.status !== "RESOLVED" : finding.status === "RESOLVED"));
  function matchesFindingFilters(finding: Finding) {
    return (findingStatusFilter === "ALL" || finding.status === findingStatusFilter) &&
      (severityFilter === "ALL" || finding.severity === severityFilter) &&
      (estimateFilter === "ALL" || (estimateFilter === "REQUIRED" ? finding.requiresEstimate : !finding.requiresEstimate));
  }
  function matchesDashboardFilter(finding: Finding) {
    return dashboardFilter === "ALL" || (dashboardFilter === "ESTIMATE" ? finding.requiresEstimate : dashboardFilter === "PENDING" ? finding.status !== "RESOLVED" : finding.status === "RESOLVED");
  }
  const orderedVisits = [...dashboardItems].sort((a, b) => b.visitDate.localeCompare(a.visitDate));
  const pageSize = 5;
  const pageCount = Math.max(1, Math.ceil(orderedVisits.length / pageSize));
  const activePage = Math.min(visitPage, pageCount - 1);
  const selectedInspection = orderedVisits.find((item) => item.id === selectedInspectionId) || orderedVisits[activePage * pageSize] || null;
  const selectedId = selectedInspection?.id || '';
  const pageVisits = orderedVisits.slice(activePage * pageSize, (activePage + 1) * pageSize);
  const selectedFindings = selectedInspection?.findings.filter((finding) => matchesFindingFilters(finding) && matchesDashboardFilter(finding)) || [];
  const secondaryFilterCount = [findingStatusFilter, severityFilter, estimateFilter, dateFilterBasis].filter((value) => value !== 'ALL' && value !== 'AUTO').length;
  useEffect(() => {
    setVisitPage(0); setSelectedInspectionId(''); setActiveTab('findings'); setExpandedFindingId(null);
  }, [directorySearch, dashboardFilter, dateFilterBasis, dateFilterDay, dateFilterFrom, dateFilterMode, dateFilterTo, estimateFilter, findingStatusFilter, propertyFilter, severityFilter, technicianFilter, waterBodyTypeFilter]);
  useEffect(() => {
    setDetailError('');
    if (!selectedId || loadedInspectionIds.current.has(selectedId)) { setLoadingDetailId(''); return; }
    const controller = new AbortController();
    setLoadingDetailId(selectedId);
    void (async () => {
      try {
        const response = await fetch(`${API_URL}/quality-inspections/${selectedId}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Could not load inspection details.');
        const detail = await response.json() as Inspection;
        if (controller.signal.aborted) return;
        loadedInspectionIds.current.add(selectedId);
        setItems((current) => current.map((item) => item.id === selectedId ? detail : item));
      } catch (error) { if (!controller.signal.aborted) setDetailError((error as Error).message); }
      finally { if (!controller.signal.aborted) setLoadingDetailId(''); }
    })();
    return () => controller.abort();
  }, [selectedId, detailAttempt]);
  function selectVisit(item: Inspection) { setSelectedInspectionId(item.id); setActiveTab('findings'); setExpandedFindingId(null); }
  function changePage(next: number) {
    setVisitPage(next); const first = orderedVisits[next * pageSize]; if (first) selectVisit(first);
  }
  function clearFilters() {
    setDirectorySearch(''); setPropertyFilter('ALL'); setTechnicianFilter('ALL'); setFindingStatusFilter('ALL'); setSeverityFilter('ALL'); setEstimateFilter('ALL'); setDashboardFilter('ALL'); setWaterBodyTypeFilter('ALL'); setDateFilterMode('ALL'); setDateFilterBasis('AUTO'); setDateFilterDay(''); setDateFilterFrom(''); setDateFilterTo('');
  }
  const selectedProperty = properties.find(
    (property) => property.id === editing?.propertyId,
  );
  function startNew() {
    setEditingId(null);
    setEditing(emptyForm());
    setPropertySearch("");
    setOriginalFindings([]);
    setMessage("");
  }
  async function startEdit(item: Inspection) {
    if (busy) return;
    setBusy(true);
    setEditingId(item.id);
    // Do not show the list version while the detail request is pending. The
    // detail response contains the current technician and findings; showing
    // the modal before it arrives can overwrite a change made by the user.
    setEditing(null);
    setMessage("Loading inspection...");
    try {
      const response = await fetch(`${API_URL}/quality-inspections/${item.id}`);
      if (!response.ok) throw new Error("Could not load the inspection for editing.");
      const detail = await response.json() as Inspection;
      setEditing(formFromInspection(detail));
      setPropertySearch(detail.property.name);
      setOriginalFindings(detail.findings);
      setMessage("");
    } catch (error) {
      setEditingId(null);
      setEditing(null);
      setMessage((error as Error).message);
    } finally { setBusy(false); }
  }
  function update(patch: Partial<Form>) {
    setEditing((current) => (current ? { ...current, ...patch } : current));
  }
  function openResolveFinding(finding: Finding, inspection: Inspection) {
    setMessage('');
    setResolvingFinding({ finding, inspection });
    setResolveForm({
      resolution: finding.resolution || "",
      resolvedAt: finding.resolvedAt ? finding.resolvedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
      responsibleName: finding.responsibleName || "",
      requiresEstimate: finding.requiresEstimate,
      estimateNumber: finding.estimateNumber || "",
      estimateSentAt: finding.estimateSentAt ? finding.estimateSentAt.slice(0, 10) : "",
    });
    setResolveConfirmed(false);
  }
  async function addFindingPhotos(index: number, files: FileList | null) {
    if (!files) return;
    const photos = await Promise.all(
      Array.from(files).slice(0, 3).map(fileData),
    );
    setEditing((current) => {
      if (!current) return current;
      const findings = [...current.findings];
      findings[index] = {
        ...findings[index],
        photos: [...findings[index].photos, ...photos],
        photosChanged: true,
      };
      return { ...current, findings };
    });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const readings = {
        pH: editing.ph,
        Chlorine: editing.chlorine,
        Alkalinity: editing.alkalinity,
        Stabilizer: editing.stabilizer,
        Salt: editing.salt,
        Temperature: editing.temperature,
        Phosphates: editing.phosphates,
        Calcium: editing.calcium,
        "Saturation index": editing.saturationIndex,
      };
      const dosages = {
        Chlorine: editing.chlorineDosage,
        Acid: editing.acidDosage,
        Algaecide: editing.algaecideDosage,
        Shock: editing.shockDosage,
        Stabilizer: editing.stabilizerDosage,
        Other: editing.otherDosage,
      };
      const alerts = chemicalAlerts(readings);
      const findingsToSave = qualityFindingsPayload(editing.findings, alerts, originalFindings);
      const response = await fetch(`${API_URL}/quality-inspections${editingId ? `/${editingId}` : ""}`, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: editing.propertyId,
          waterBodyId: editing.waterBodyId || null,
          technicianName: editing.technicianName,
          visitDate: qualityVisitInstant(editing.visitDate),
          readings,
          dosages,
          notes: editing.notes,
          findings: findingsToSave,
          ...(editingId ? {} : { photos: editing.photos }),
        }),
      });
      const responseText = await response.text();
      let data: { message?: string } = {};
      try {
        data = responseText ? JSON.parse(responseText) as { message?: string } : {};
      } catch {
        // Keep the raw response below so deployment/proxy errors are visible.
      }
      if (!response.ok) {
        throw new Error(
          data.message || responseText || `Could not save inspection (${response.status}).`,
        );
      }
      const saved = data as Inspection;
      loadedInspectionIds.current.add(saved.id);
      setItems((current) => editingId ? current.map((item) => item.id === editingId ? saved : item) : [saved, ...current]);
      setSelectedInspectionId(saved.id);
      setActiveTab('findings');
      setEditingId(null);
      setEditing(null);
      setMessage("Quality inspection saved.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function updateFinding(id: string, status: string) {
    if (busy) return;
    if (status === "RESOLVED") {
      const match = items.flatMap((inspection) => inspection.findings.map((finding) => ({ inspection, finding }))).find(({ finding }) => finding.id === id);
      if (match) openResolveFinding(match.finding, match.inspection);
      return;
    }
    setBusy(true); setMessage('');
    try {
    const response = await fetch(
      `${API_URL}/quality-inspections/findings/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      },
    );
    if (!response.ok) {
      throw new Error("Could not update finding.");
    }
    setItems((current) =>
      current.map((inspection) => ({
        ...inspection,
        findings: inspection.findings.map((finding) =>
          finding.id === id ? { ...finding, status } : finding,
        ),
      })),
    );
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function resolveFinding(event: FormEvent) {
    event.preventDefault();
    if (!resolvingFinding || !resolvingFinding.finding.id || !resolveConfirmed || busy) return;
    if (!resolveForm.resolution.trim() || !resolveForm.resolvedAt) { setMessage("Describe what was done before resolving the finding."); return; }
    if (resolveForm.requiresEstimate && (!resolveForm.estimateNumber.trim() || !resolveForm.estimateSentAt)) { setMessage("Add the estimate number and sent date."); return; }
    setBusy(true); setMessage('');
    try {
    const response = await fetch(`${API_URL}/quality-inspections/findings/${resolvingFinding.finding.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "RESOLVED",
        requiresEstimate: resolveForm.requiresEstimate,
        resolution: resolveForm.resolution.trim(),
        resolvedAt: new Date(`${resolveForm.resolvedAt}T12:00:00`).toISOString(),
        responsibleName: resolveForm.responsibleName.trim() || null,
        estimateNumber: resolveForm.requiresEstimate ? resolveForm.estimateNumber.trim() : null,
        estimateSentAt: resolveForm.requiresEstimate && resolveForm.estimateSentAt ? new Date(`${resolveForm.estimateSentAt}T12:00:00`).toISOString() : null,
      }),
    });
    if (!response.ok) throw new Error("Could not resolve finding.");
    const saved = await response.json() as Finding;
    setItems((current) => current.map((inspection) => ({ ...inspection, findings: inspection.findings.map((finding) => finding.id === resolvingFinding.finding.id ? { ...finding, ...saved } : finding) })));
    setResolvingFinding(null);
    setMessage("Finding resolved.");
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function deleteFinding(id: string) {
    if (busy || !isSuperAdmin || !window.confirm("Delete this finding?")) return;
    setBusy(true); setMessage('');
    try {
    const response = await fetch(`${API_URL}/quality-inspections/findings/${id}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Could not delete finding.");
    setItems((current) => current.map((inspection) => ({ ...inspection, findings: inspection.findings.filter((finding) => finding.id !== id) })));
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function deleteInspection(id: string) {
    if (busy || !isSuperAdmin || !window.confirm("Delete this entire quality inspection?")) return;
    setBusy(true); setMessage('');
    try {
    const response = await fetch(`${API_URL}/quality-inspections/${id}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Could not delete inspection.");
    setItems((current) => current.filter((inspection) => inspection.id !== id));
    loadedInspectionIds.current.delete(id);
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <div className="page app-page quality-page quality-workspace">
      {sidebar}
      <header className="area-page-header quality-workspace-header">
        <div><span className="area-eyebrow">FIELD SERVICE</span><h1>Quality Inspections</h1><p>Pool visits, chemical readings, findings and follow-up by property.</p></div>
        <div className="quality-workspace-header-actions"><button type="button" className="quality-button quality-button-secondary" onClick={() => setPeriodReportOpen(true)}><WorkspaceIcon name="calendar" />Period report</button><button type="button" className="quality-button quality-button-primary" onClick={startNew}><WorkspaceIcon name="plus" />New inspection</button></div>
      </header>
      {message && <p className="quality-status-message" role="status">{message}</p>}
      <section className="quality-workspace-kpis" aria-label="Quality quick views">
        {([
          ['ALL', dashboardCounts.all, 'All', 'layers', 'all'], ['PENDING', dashboardCounts.pending, 'Pending', 'clock', 'pending'],
          ['SOLVED', dashboardCounts.solved, 'Solved', 'check-circle', 'solved'], ['ESTIMATE', dashboardCounts.estimate, 'Require estimate', 'hard-hat', 'estimate'],
        ] as const).map(([value, count, label, icon, tone]) => <button type="button" key={value} className={`quality-workspace-kpi quality-kpi-${tone}`} aria-pressed={dashboardFilter === value} onClick={() => setDashboardFilter(value)}><span className="quality-kpi-icon"><WorkspaceIcon name={icon} /></span><span className="quality-kpi-copy"><span>{label}</span><strong>{count}</strong></span></button>)}
      </section>
      <section className="quality-workspace-filters" aria-label="Quality filters">
        <h2><WorkspaceIcon name="filter" />Filters</h2>
        <div className="quality-primary-filters">
          <label><WorkspaceIcon name="calendar" /><select aria-label="Date filter" value={dateFilterMode} onChange={(event) => setDateFilterMode(event.target.value)}><option value="ALL">All dates</option><option value="DAY">Specific date</option><option value="RANGE">Date range</option></select></label>
          <label><WorkspaceIcon name="pin" /><select aria-label="Property filter" value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)}><option value="ALL">All properties</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></label>
          <label><WorkspaceIcon name="layers" /><select aria-label="Water body type filter" value={waterBodyTypeFilter} onChange={(event) => setWaterBodyTypeFilter(event.target.value)}><option value="ALL">All types</option>{typeOptions.map((type) => <option key={type} value={type}>{waterBodyTypes[type] || type.toLowerCase().replaceAll('_', ' ')}</option>)}</select></label>
          <label><WorkspaceIcon name="users" /><select aria-label="Technician filter" value={technicianFilter} onChange={(event) => setTechnicianFilter(event.target.value)}><option value="ALL">All technicians</option>{technicianOptions.map((technician) => <option key={technician}>{technician}</option>)}</select></label>
        </div>
        <button type="button" className="quality-clear-filters" onClick={clearFilters}>Clear filters</button>
        <div className="quality-secondary-filter-tools"><button type="button" aria-expanded={moreFilters} aria-controls="quality-additional-filters" onClick={() => setMoreFilters(!moreFilters)}><WorkspaceIcon name="sliders" />More filters{secondaryFilterCount > 0 && <b>{secondaryFilterCount}</b>}</button>{dateFilterMode !== 'ALL' && <span>Dates use {activeDateBasis === 'RESOLVED' ? 'finding resolution' : 'inspection visit'} date · Colombia time</span>}</div>
        {dateFilterMode !== 'ALL' && <div className="quality-period-fields">{dateFilterMode === 'DAY' ? <label>{activeDateBasis === 'RESOLVED' ? 'Resolved date' : 'Inspection date'}<input aria-label={activeDateBasis === 'RESOLVED' ? 'Resolved date' : 'Inspection date'} type="date" value={dateFilterDay} onChange={(event) => setDateFilterDay(event.target.value)} /></label> : <><label>From<input aria-label="From" type="date" value={dateFilterFrom} onChange={(event) => setDateFilterFrom(event.target.value)} /></label><label>To<input aria-label="To" type="date" min={dateFilterFrom || undefined} value={dateFilterTo} onChange={(event) => setDateFilterTo(event.target.value)} /></label></>}</div>}
        {moreFilters && <div className="quality-additional-filters" id="quality-additional-filters">
          <label>Finding status<select aria-label="Finding status" value={findingStatusFilter} onChange={(event) => setFindingStatusFilter(event.target.value)}><option value="ALL">All statuses</option><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option></select></label>
          <label>Importance<select aria-label="Importance filter" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}><option value="ALL">All levels</option><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></label>
          <label>Estimate<select aria-label="Estimate filter" value={estimateFilter} onChange={(event) => setEstimateFilter(event.target.value)}><option value="ALL">All findings</option><option value="REQUIRED">Requires estimate</option><option value="NOT_REQUIRED">No estimate required</option></select></label>
          <label>Date based on<select aria-label="Date based on" value={dateFilterBasis} onChange={(event) => setDateFilterBasis(event.target.value as QualityDateBasis)}><option value="AUTO">Automatic ({activeDateBasis === 'RESOLVED' ? 'resolved' : 'inspection'} date)</option><option value="VISIT">Inspection date</option><option value="RESOLVED">Resolved date</option></select></label>
        </div>}
      </section>
      <div className="quality-workspace-body">
        <section className="quality-visit-browser" aria-labelledby="quality-visits-title">
          <div className="quality-visit-browser-heading"><h2 id="quality-visits-title">Inspection visits</h2><span>{orderedVisits.length} records</span></div>
          <SearchField aria-label="Search quality inspections" placeholder="Search by property…" value={directorySearch} onChange={(event) => setDirectorySearch(event.target.value)} />
          <div className="quality-visit-options" aria-label="Inspection visits">
            {loading ? <p className="quality-workspace-empty">Loading inspections…</p> : pageVisits.length === 0 ? <p className="quality-workspace-empty">No inspections or findings match the selected filters.</p> : pageVisits.map((item) => {
              const severity = visitSeverity(item);
              return <button type="button" key={item.id} className="quality-visit-option" aria-pressed={selectedId === item.id} onClick={() => selectVisit(item)}><WorkspaceIcon name="clipboard-check" /><span className="quality-visit-option-copy"><strong>{item.property.name}</strong><span>{visitLabel(item.visitDate)}</span></span>{severity && <span className={`quality-pill quality-pill-${severity.toLowerCase()}`}>{severityLabel(severity)}</span>}<WorkspaceIcon name="chevron-right" /></button>;
            })}
          </div>
          <nav className="quality-visit-pagination" aria-label="Inspection visit pages"><button type="button" aria-label="Previous visits" disabled={activePage === 0} onClick={() => changePage(activePage - 1)}><WorkspaceIcon name="chevron-left" /></button><span>{orderedVisits.length ? activePage * pageSize + 1 : 0}–{Math.min((activePage + 1) * pageSize, orderedVisits.length)} of {orderedVisits.length}</span><button type="button" aria-label="Next visits" disabled={activePage + 1 >= pageCount} onClick={() => changePage(activePage + 1)}><WorkspaceIcon name="chevron-right" /></button></nav>
        </section>
        <section className="quality-selected-inspection" aria-label="Selected inspection">
          {!selectedInspection ? <div className="quality-no-selection"><WorkspaceIcon name="clipboard-check" /><h2>{loading ? 'Loading inspection visits…' : 'No inspection selected'}</h2><p>{loading ? 'Your visits will appear here.' : 'Choose different filters to review inspection visits.'}</p></div> : <>
            <header className="quality-inspection-detail-heading"><div><span className="quality-section-eyebrow">INSPECTION VISIT</span><h2>{selectedInspection.property.name}</h2><div className="quality-inspection-meta"><span><WorkspaceIcon name="calendar" />{visitLabel(selectedInspection.visitDate)}</span><span><WorkspaceIcon name="users" />Technician: {selectedInspection.technicianName || 'Not recorded'}</span>{selectedInspection.waterBody && <span><WorkspaceIcon name="pool" />{selectedInspection.waterBody.name}</span>}</div></div><WorkspaceActionsMenu label={`Actions for inspection ${selectedInspection.property.name}`} disabled={busy || loadingDetailId === selectedId} actions={[{ label: 'Edit inspection', icon: 'edit', onSelect: () => void startEdit(selectedInspection) }, ...(isSuperAdmin ? [{ label: 'Delete inspection', icon: 'trash' as const, danger: true, onSelect: () => void deleteInspection(selectedInspection.id) }] : [])]} /></header>
            <QualityReadings readings={selectedInspection.readings} />
            <div className="quality-detail-tabs" role="tablist" aria-label="Inspection information" onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const tabs = ['findings', 'dosages', 'notes'] as const;
              const index = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (tabs.indexOf(activeTab) + (event.key === 'ArrowRight' ? 1 : -1) + 3) % 3;
              setActiveTab(tabs[index]); document.getElementById(`quality-tab-${tabs[index]}`)?.focus();
            }}>
              {(['findings', 'dosages', 'notes'] as const).map((tab) => <button type="button" id={`quality-tab-${tab}`} key={tab} role="tab" tabIndex={activeTab === tab ? 0 : -1} aria-selected={activeTab === tab} aria-controls={`quality-panel-${tab}`} onClick={() => setActiveTab(tab)}>{tab === 'findings' ? `Findings (${selectedFindings.length})` : tab === 'dosages' ? 'Dosages' : 'Notes'}</button>)}
            </div>
            {loadingDetailId === selectedId && <p className="quality-detail-loading" role="status">Loading inspection details…</p>}
            {detailError && <p className="quality-detail-error" role="alert">{detailError}<button type="button" onClick={() => setDetailAttempt((attempt) => attempt + 1)}>Retry</button></p>}
            {activeTab === 'findings' && <div role="tabpanel" id="quality-panel-findings" aria-labelledby="quality-tab-findings" className="quality-findings-list">
              {selectedFindings.length === 0 ? <p className="quality-workspace-empty">No findings match this selection.</p> : selectedFindings.map((finding, index) => {
                const findingKey = finding.id || `${selectedId}-${index}`, expanded = expandedFindingId === findingKey;
                return <article className={`quality-finding-row quality-finding-signal-${signal(finding)}`} key={findingKey}>
                  <i className="quality-finding-signal" aria-label={finding.status === 'RESOLVED' ? 'Resolved finding' : `${severityLabel(finding.severity)} importance finding`} />
                  <div className="quality-finding-content">{finding.photos?.length > 0 && <button type="button" className="quality-finding-thumbnail" onClick={() => setPreviewPhoto(finding.photos[0])} aria-label={`View ${finding.photos[0].name}`}><img src={finding.photos[0].data} alt={finding.photos[0].name} />{finding.photos.length > 1 && <span>+{finding.photos.length - 1}</span>}</button>}<button type="button" className="quality-finding-description" aria-expanded={expanded} onClick={() => setExpandedFindingId(expanded ? null : findingKey)}>{finding.description}</button></div>
                  <span className={`quality-pill quality-pill-${finding.severity.toLowerCase()}`}>{severityLabel(finding.severity)}</span>
                  <span className="quality-finding-estimate-slot">{finding.requiresEstimate && <span className="quality-pill quality-pill-estimate">Estimate</span>}</span>
                  <select aria-label={`Update finding: ${finding.description}`} value={finding.status} disabled={busy || !finding.id || loadingDetailId === selectedId} onChange={(event) => finding.id && void updateFinding(finding.id, event.target.value)}><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option></select>
                  <WorkspaceActionsMenu label={`Actions for finding ${finding.description}`} disabled={busy || !finding.id || loadingDetailId === selectedId} actions={[
                    { label: expanded ? 'Hide details' : 'View details', icon: 'info', onSelect: () => setExpandedFindingId(expanded ? null : findingKey) },
                    { label: finding.status === 'RESOLVED' ? 'Edit resolution' : 'Resolve finding', icon: 'check-circle', onSelect: () => openResolveFinding(finding, selectedInspection) },
                    { label: 'Edit finding', icon: 'edit', onSelect: () => void startEdit(selectedInspection) },
                    ...(isSuperAdmin ? [{ label: 'Delete finding', icon: 'trash' as const, danger: true, onSelect: () => finding.id && void deleteFinding(finding.id) }] : []),
                  ]} />
                  {expanded && <div className="quality-finding-expanded-details"><p>{finding.description}</p>{finding.responsibleName && <p><strong>Responsible:</strong> {finding.responsibleName}</p>}{finding.photos?.length > 0 && <div className="quality-detail-photos">{finding.photos.map((photo, photoIndex) => <button type="button" key={`${photo.name}-${photoIndex}`} onClick={() => setPreviewPhoto(photo)} aria-label={`View ${photo.name}`}><img src={photo.data} alt={photo.name} /></button>)}</div>}{finding.resolution && <p><strong>Resolution:</strong> {finding.resolution}{finding.resolvedAt ? ` · ${dateLabel(finding.resolvedAt)}` : ''}</p>}{finding.estimateNumber && <p><strong>Estimate:</strong> #{finding.estimateNumber}{finding.estimateSentAt ? ` · sent ${dateLabel(finding.estimateSentAt)}` : ''}</p>}{(finding.resolutionUpdatedByName || finding.resolvedByName) && <p className="quality-detail-audit">{finding.resolutionUpdatedByName && `Written by ${finding.resolutionUpdatedByName}`}{finding.resolutionUpdatedByName && finding.resolvedByName && ' · '}{finding.resolvedByName && `Resolved by ${finding.resolvedByName}`}</p>}</div>}
                </article>;
              })}
            </div>}
            {activeTab === 'dosages' && <div role="tabpanel" id="quality-panel-dosages" aria-labelledby="quality-tab-dosages" className="quality-dosage-panel">{Object.entries(selectedInspection.dosages || {}).some(([, value]) => value) ? Object.entries(selectedInspection.dosages || {}).filter(([, value]) => value).map(([key, value]) => <div key={key}><WorkspaceIcon name="chemicals" /><span>{dosageLabels[key] || key}</span><strong>{value}</strong></div>) : <p className="quality-workspace-empty">No dosages recorded for this visit.</p>}</div>}
            {activeTab === 'notes' && <div role="tabpanel" id="quality-panel-notes" aria-labelledby="quality-tab-notes" className="quality-notes-panel"><p>{selectedInspection.notes || 'No notes recorded for this visit.'}</p>{selectedInspection.photos?.length > 0 && <div className="quality-detail-photos">{selectedInspection.photos.map((photo, index) => <button type="button" key={`${photo.name}-${index}`} aria-label={`View ${photo.name}`} onClick={() => setPreviewPhoto(photo)}><img src={photo.data} alt={photo.name} /></button>)}</div>}</div>}
            <details className="quality-reading-guide"><summary>Reading alert scale</summary><div><span className="quality-guide-normal">Normal</span><span className="quality-guide-warning">Review range</span><span className="quality-guide-alert">Alert range</span></div><p>Target ranges: pH 7.0–7.8 · Chlorine 1–7 ppm · Alkalinity 80–120 ppm · Stabilizer 30–60 ppm · Salt ≤4500 ppm · Calcium ≤500 ppm · Phosphates ≤300 ppb · Saturation index -0.3–0.3 · Temperature ≤104°F.</p></details>
          </>}
        </section>
      </div>
      {periodReportOpen && <QualityPeriodReport items={dashboardItems.map((item) => ({ ...item, findings: item.findings.filter(matchesDashboardFilter) }))} initialBasis={activeDateBasis} onClose={() => setPeriodReportOpen(false)} />}
      {editing && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="quality-editor-title"
            className="property-modal quality-editor-modal"
          >
            <div className="edit-panel-header">
              <h2 id="quality-editor-title">{editingId ? "Edit quality inspection" : "New quality inspection"}</h2>
              <button
                className="modal-close"
                onClick={() => setEditing(null)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <form
              onSubmit={(event) => void save(event)}
              className="quality-form"
            >
              {message && <p className="quality-wide health-sync-message" role="alert">{message}</p>}
              <label>
                Property
                <SearchField
                  aria-label="Search inspection property"
                  list="quality-properties"
                  required
                  autoComplete="off"
                  placeholder="Type to search a property"
                  value={propertySearch}
                  onChange={(event) => {
                    setPropertySearch(event.target.value);
                    const selected = properties.find((property) => property.name.toLowerCase() === event.target.value.trim().toLowerCase());
                    update({ propertyId: selected?.id || "", waterBodyId: "" });
                  }}
                />
                <datalist id="quality-properties">
                  {properties.map((property) => (
                    <option key={property.id} value={property.name} />
                  ))}
                </datalist>
              </label>
              <label>
                Pool / water body
                <select
                  value={editing.waterBodyId}
                  onChange={(event) =>
                    update({ waterBodyId: event.target.value })
                  }
                >
                  <option value="">Select pool</option>
                  {selectedProperty?.waterBodies
                    .filter((body) => body.active !== false)
                    .map((body) => (
                      <option key={body.id} value={body.id}>
                        {body.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Technician
                <select
                  required
                  value={editing.technicianName}
                  onChange={(event) =>
                    update({ technicianName: event.target.value })
                  }
                >
                  <option value="">Select technician</option>
                  {technicianOptions.map((technician) => (
                    <option value={technician} key={technician}>{technician}</option>
                  ))}
                </select>
              </label>
              <label>
                Visit date
                <input
                  required
                  type="datetime-local"
                  value={editing.visitDate}
                  onChange={(event) =>
                    update({ visitDate: event.target.value })
                  }
                />
              </label>
              <fieldset className="quality-readings-field">
                <legend>Readings</legend>
                {readingFields.map(([key, label, options]) => (
                  <label key={key}>
                    {label}
                    {key === "ph" ? (
                      <input type="number" min="6" max="9" step="0.1" value={editing[key] as string} onChange={(event) => update({ [key]: event.target.value })} />
                    ) : key === "saturationIndex" ? (
                      <>
                        <input type="number" step="0.01" list="saturation-index-values" value={editing[key] as string} onChange={(event) => update({ [key]: event.target.value })} />
                        <datalist id="saturation-index-values">
                          {options.map((option) => <option value={option} key={option} />)}
                        </datalist>
                      </>
                    ) : (
                      <select value={editing[key] as string} onChange={(event) => update({ [key]: event.target.value })}>
                        <option value="">Select</option>
                        {options.map((option) => <option value={option} key={option}>{option}</option>)}
                      </select>
                    )}
                  </label>
                ))}
              </fieldset>
              <fieldset className="quality-readings-field">
                <legend>Dosages</legend>
                {dosageFields.map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      type="text"
                      placeholder="Amount applied"
                      value={editing[key] as string}
                      onChange={(event) =>
                        update({ [key]: event.target.value })
                      }
                    />
                  </label>
                ))}
              </fieldset>
              <label className="quality-wide">
                Comments
                <textarea
                  rows={4}
                  value={editing.notes}
                  onChange={(event) => update({ notes: event.target.value })}
                  placeholder="Add visit comments and context"
                />
              </label>
              <div className="quality-wide quality-findings-editor">
                <div className="quality-editor-section-heading">
                  <strong>Findings</strong>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      update({
                        findings: [...editing.findings, emptyFinding()],
                      })
                    }
                  >
                    + Add finding
                  </button>
                </div>
                {editing.findings.map((finding, index) => (
                  <div className="quality-finding-editor" key={index}>
                    <label className="quality-finding-photo-field">
                      Photo
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(event) =>
                          void addFindingPhotos(index, event.target.files)
                        }
                      />
                      {finding.photos.length > 0 && (
                        <small>
                          {finding.photos.length} photo
                          {finding.photos.length === 1 ? "" : "s"} selected
                        </small>
                      )}
                    </label>
                    <textarea
                      required
                      rows={3}
                      placeholder="Describe the finding"
                      value={finding.description}
                      onChange={(event) => {
                        const findings = [...editing.findings];
                        findings[index] = {
                          ...finding,
                          description: event.target.value,
                        };
                        update({ findings });
                      }}
                    />
                    <select
                      aria-label="Responsible person"
                      value={finding.responsibleName || ""}
                      onChange={(event) => {
                        const findings = [...editing.findings];
                        findings[index] = { ...finding, responsibleName: event.target.value };
                        update({ findings });
                      }}
                    >
                      <option value="">Select responsible technician</option>
                      {[...new Set([...(finding.responsibleName ? [finding.responsibleName] : []), ...technicianOptions])].map((technician) => <option value={technician} key={technician}>{technician}</option>)}
                    </select>
                    <select
                      aria-label="Finding importance"
                      value={finding.severity}
                      onChange={(event) => {
                        const findings = [...editing.findings];
                        findings[index] = {
                          ...finding,
                          severity: event.target.value,
                        };
                        update({ findings });
                      }}
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                    </select>
                    <label className="quality-estimate-check"><input type="checkbox" checked={finding.requiresEstimate} onChange={(event) => { const findings = [...editing.findings]; findings[index] = { ...finding, requiresEstimate: event.target.checked }; update({ findings }); }} /><span>Requires estimate</span></label>
                  </div>
                ))}
              </div>
              <div className="modal-actions quality-wide">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
                <button className="primary-button" disabled={busy}>
                  {busy ? "Saving..." : editingId ? "Save changes" : "Save inspection"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {resolvingFinding && (
        <div className="modal-backdrop">
          <section role="dialog" aria-modal="true" aria-labelledby="quality-resolve-title" className="property-modal quality-resolve-modal">
            <div className="edit-panel-header">
              <div><span className="area-eyebrow">RESOLVE FINDING</span><h2 id="quality-resolve-title">{resolvingFinding.inspection.property.name}</h2></div>
              <button className="modal-close" onClick={() => setResolvingFinding(null)} aria-label="Close">&times;</button>
            </div>
            <div className="quality-resolve-summary">
              <strong>{severityLabel(resolvingFinding.finding.severity)}{resolvingFinding.finding.responsibleName ? ` · ${resolvingFinding.finding.responsibleName}` : ""}</strong>
              <p>{resolvingFinding.finding.description}</p>
              <small>{resolvingFinding.inspection.waterBody?.name || "Pool"} · Technician: {resolvingFinding.inspection.technicianName}</small>
            </div>
            <form onSubmit={(event) => void resolveFinding(event)} className="quality-resolve-form">
              {message && <p className="quality-status-message" role="alert">{message}</p>}
              <label className="quality-wide"><span>What was done?</span><textarea aria-label="What was done?" required rows={5} value={resolveForm.resolution} onChange={(event) => setResolveForm((current) => ({ ...current, resolution: event.target.value }))} placeholder="Describe the completed work..." /></label>
              <div className="quality-resolve-grid">
                <label><span>Responsible</span><select aria-label="Resolution responsible" value={resolveForm.responsibleName} onChange={(event) => setResolveForm((current) => ({ ...current, responsibleName: event.target.value }))}><option value="">Select responsible technician</option>{[...new Set([...(resolveForm.responsibleName ? [resolveForm.responsibleName] : []), ...technicianOptions])].map((technician) => <option value={technician} key={technician}>{technician}</option>)}</select></label>
                <label><span>Resolved date</span><input required type="date" value={resolveForm.resolvedAt} onChange={(event) => setResolveForm((current) => ({ ...current, resolvedAt: event.target.value }))} /></label>
              </div>
              <fieldset className="quality-resolve-estimate"><legend>Requires estimate?</legend><div className="quality-radio-row"><label><input type="radio" checked={!resolveForm.requiresEstimate} onChange={() => setResolveForm((current) => ({ ...current, requiresEstimate: false }))} /> No</label><label><input type="radio" checked={resolveForm.requiresEstimate} onChange={() => setResolveForm((current) => ({ ...current, requiresEstimate: true }))} /> Yes</label></div>{resolveForm.requiresEstimate && <div className="quality-resolve-grid"><label><span>Estimate number sent</span><input required value={resolveForm.estimateNumber} onChange={(event) => setResolveForm((current) => ({ ...current, estimateNumber: event.target.value }))} placeholder="e.g. 6761" /></label><label><span>Estimate sent date</span><input required type="date" value={resolveForm.estimateSentAt} onChange={(event) => setResolveForm((current) => ({ ...current, estimateSentAt: event.target.value }))} /></label></div>}</fieldset>
              <label className="quality-confirm"><input type="checkbox" checked={resolveConfirmed} onChange={(event) => setResolveConfirmed(event.target.checked)} /> I confirm that this finding has been resolved.</label>
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setResolvingFinding(null)}>Cancel</button><button className="primary-button" disabled={busy || !resolveConfirmed || !resolveForm.resolution.trim() || !resolveForm.resolvedAt || (resolveForm.requiresEstimate && (!resolveForm.estimateNumber.trim() || !resolveForm.estimateSentAt))}>{busy ? "Saving?" : "Mark as solved"}</button></div>
            </form>
          </section>
        </div>
      )}
      {previewPhoto && (
        <div className="quality-photo-lightbox" role="presentation" onClick={() => setPreviewPhoto(null)}>
          <button type="button" className="quality-photo-lightbox-close" onClick={() => setPreviewPhoto(null)} aria-label="Close image">&times;</button>
          <img src={previewPhoto.data} alt={previewPhoto.name} onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
