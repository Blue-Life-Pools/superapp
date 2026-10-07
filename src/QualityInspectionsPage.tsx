import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { API_URL, apiFetch as fetch } from "./api";

type WaterBody = { id: string; name: string; type: string; active?: boolean };
type Property = { id: string; name: string; waterBodies: WaterBody[] };
type Photo = { name: string; type: string; data: string };
type Finding = {
  id?: string;
  title?: string;
  description: string;
  severity: string;
  status: string;
  requiresEstimate: boolean;
  resolution?: string | null;
  photos: Photo[];
};
type Inspection = {
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
  visitDate: new Date().toISOString().slice(0, 16),
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
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [findingFilter, setFindingFilter] = useState("ALL");
  const [dashboardFilter, setDashboardFilter] = useState("ALL");
  const [propertyFilter, setPropertyFilter] = useState("ALL");
  const [technicianFilter, setTechnicianFilter] = useState("ALL");
  const [findingStatusFilter, setFindingStatusFilter] = useState("ALL");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [estimateFilter, setEstimateFilter] = useState("ALL");
  const [expandedFindingGroups, setExpandedFindingGroups] = useState<Set<string>>(new Set());
  const [loadingFindingGroups, setLoadingFindingGroups] = useState<Set<string>>(new Set());
  const [loadedFindingGroups, setLoadedFindingGroups] = useState<Set<string>>(new Set());
  const [technicians, setTechnicians] = useState<string[]>([]);
  async function load() {
    const response = await fetch(`${API_URL}/quality-inspections`);
    if (!response.ok) throw new Error("Could not load quality inspections.");
    setItems((await response.json()) as Inspection[]);
  }
  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, []);
  useEffect(() => {
    async function loadTechnicians() {
      const [technicianResponse, reportsResponse] = await Promise.all([
        fetch(`${API_URL}/chemicals/technicians`),
        fetch(`${API_URL}/reports`),
      ]);
      const names = new Set<string>();
      if (technicianResponse.ok) (await technicianResponse.json() as Array<{ name?: string }>).forEach((item) => item.name?.trim() && names.add(item.name.trim()));
      if (reportsResponse.ok) {
        const payload = await reportsResponse.json() as { incidents?: Array<{ technician?: { name?: string } }> } | Array<{ technician?: { name?: string } }>;
        const reports = Array.isArray(payload) ? payload : payload.incidents || [];
        reports.forEach((item) => item.technician?.name?.trim() && names.add(item.technician.name.trim()));
      }
      setTechnicians([...names].sort((a, b) => a.localeCompare(b)));
    }
    void loadTechnicians().catch(() => setTechnicians([]));
  }, []);
  const qualityFilteredItems = useMemo(
    () => items.filter((inspection) => {
      if (propertyFilter !== "ALL" && inspection.propertyId !== propertyFilter) return false;
      if (technicianFilter !== "ALL" && inspection.technicianName !== technicianFilter) return false;
      if (findingStatusFilter === "ALL" && severityFilter === "ALL" && estimateFilter === "ALL") return true;
      return inspection.findings.some((finding) =>
        (findingStatusFilter === "ALL" || finding.status === findingStatusFilter) &&
        (severityFilter === "ALL" || finding.severity === severityFilter) &&
        (estimateFilter === "ALL" || (estimateFilter === "REQUIRED" ? finding.requiresEstimate : !finding.requiresEstimate)),
      );
    }),
    [estimateFilter, findingStatusFilter, items, propertyFilter, severityFilter, technicianFilter],
  );
  const openFindings = useMemo(
    () =>
      qualityFilteredItems.flatMap((inspection) =>
        inspection.findings
          .filter((finding) => finding.status !== "RESOLVED" &&
            (findingStatusFilter === "ALL" || finding.status === findingStatusFilter) &&
            (severityFilter === "ALL" || finding.severity === severityFilter) &&
            (estimateFilter === "ALL" || (estimateFilter === "REQUIRED" ? finding.requiresEstimate : !finding.requiresEstimate)))
          .map((finding) => ({ inspection, finding })),
      ),
    [estimateFilter, findingStatusFilter, qualityFilteredItems, severityFilter],
  );
  const filteredFindings =
    findingFilter === "ALL"
      ? openFindings
      : openFindings.filter(({ finding }) => finding.status === findingFilter);
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
  async function toggleFindingGroup(inspectionId: string) {
    if (expandedFindingGroups.has(inspectionId)) {
      setExpandedFindingGroups((current) => { const next = new Set(current); next.delete(inspectionId); return next; });
      return;
    }
    setExpandedFindingGroups((current) => new Set(current).add(inspectionId));
    const inspection = items.find((item) => item.id === inspectionId);
    if (!inspection || loadedFindingGroups.has(inspectionId)) return;
    setLoadingFindingGroups((current) => new Set(current).add(inspectionId));
    try {
      const response = await fetch(`${API_URL}/quality-inspections/${inspectionId}`);
      if (!response.ok) throw new Error("Could not load findings.");
      const detail = await response.json() as Inspection;
      setItems((current) => current.map((item) => item.id === inspectionId ? detail : item));
      setLoadedFindingGroups((current) => new Set(current).add(inspectionId));
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoadingFindingGroups((current) => { const next = new Set(current); next.delete(inspectionId); return next; });
    }
  }
  const selectedProperty = properties.find(
    (property) => property.id === editing?.propertyId,
  );
  function startNew() {
    setEditing(emptyForm());
    setMessage("");
  }
  function update(patch: Partial<Form>) {
    setEditing((current) => (current ? { ...current, ...patch } : current));
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
      const response = await fetch(`${API_URL}/quality-inspections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: editing.propertyId,
          waterBodyId: editing.waterBodyId || null,
          technicianName: editing.technicianName,
          visitDate: new Date(editing.visitDate).toISOString(),
          readings,
          dosages,
          notes: editing.notes,
          findings: editing.findings.filter(
            (finding) =>
              (finding.title || "Finding").trim() && finding.description.trim(),
          ),
          photos: editing.photos,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Could not save inspection.");
      setItems((current) => [data, ...current]);
      setEditing(null);
      setMessage("Quality inspection saved.");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function updateFinding(id: string, status: string) {
    const response = await fetch(
      `${API_URL}/quality-inspections/findings/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      },
    );
    if (!response.ok) {
      setMessage("Could not update finding.");
      return;
    }
    setItems((current) =>
      current.map((inspection) => ({
        ...inspection,
        findings: inspection.findings.map((finding) =>
          finding.id === id ? { ...finding, status } : finding,
        ),
      })),
    );
  }
  async function deleteFinding(id: string) {
    if (!isSuperAdmin || !window.confirm("Delete this finding?")) return;
    const response = await fetch(`${API_URL}/quality-inspections/findings/${id}`, { method: "DELETE" });
    if (!response.ok) { setMessage("Could not delete finding."); return; }
    setItems((current) => current.map((inspection) => ({ ...inspection, findings: inspection.findings.filter((finding) => finding.id !== id) })));
  }
  async function deleteInspection(id: string) {
    if (!isSuperAdmin || !window.confirm("Delete this entire quality inspection?")) return;
    const response = await fetch(`${API_URL}/quality-inspections/${id}`, { method: "DELETE" });
    if (!response.ok) { setMessage("Could not delete inspection."); return; }
    setItems((current) => current.filter((inspection) => inspection.id !== id));
  }
  return (
    <div className="page app-page quality-page">
      {sidebar}
      <header className="area-page-header quality-header">
        <div>
          <span className="area-eyebrow">FIELD SERVICE</span>
          <h1>Quality inspections</h1>
          <p>
            Pool visits, chemical readings, dosages, findings and follow-up by
            property.
          </p>
        </div>
        <button className="primary-button" onClick={startNew}>
          + New inspection
        </button>
      </header>
      {message && (
        <p className="health-sync-message quality-message">{message}</p>
      )}
      <div className="quality-dashboard-filters" aria-label="Quality filters">
        {[["ALL", dashboardCounts.all, "All"], ["PENDING", dashboardCounts.pending, "Pending"], ["SOLVED", dashboardCounts.solved, "Solved"], ["ESTIMATE", dashboardCounts.estimate, "Require estimate"]].map(([value, count, label]) => <button type="button" className={dashboardFilter === value ? "quality-dashboard-filter active" : "quality-dashboard-filter"} aria-pressed={dashboardFilter === value} onClick={() => setDashboardFilter(value as string)} key={value as string}><span>{count}</span>{label}</button>)}
      </div>
      <div className="quality-dashboard-kpis"><article><span>Total findings</span><strong>{dashboardCounts.all}</strong><small>Current selection</small></article><article><span>Pending</span><strong>{dashboardCounts.pending}</strong><small>Needs action</small></article><article><span>Solved</span><strong>{dashboardCounts.solved}</strong><small>Work completed</small></article><article><span>Require estimate</span><strong>{dashboardCounts.estimate}</strong><small>Supervisor follow-up</small></article></div>
      <section className="quality-filter-panel" aria-label="Quality filters">
        <div className="quality-filter-heading">
          <div><h2>Filters</h2><p>Filter inspections, readings and findings by Quality information.</p></div>
          <button type="button" onClick={() => { setPropertyFilter("ALL"); setTechnicianFilter("ALL"); setFindingStatusFilter("ALL"); setSeverityFilter("ALL"); setEstimateFilter("ALL"); setDashboardFilter("ALL"); }}>Clear filters</button>
        </div>
        <div className="quality-filter-grid">
          <label><span>Property</span><select value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)}><option value="ALL">All properties</option>{properties.map((property) => <option value={property.id} key={property.id}>{property.name}</option>)}</select></label>
          <label><span>Technician</span><select value={technicianFilter} onChange={(event) => setTechnicianFilter(event.target.value)}><option value="ALL">All technicians</option>{technicians.map((technician) => <option value={technician} key={technician}>{technician}</option>)}</select></label>
          <label><span>Finding status</span><select value={findingStatusFilter} onChange={(event) => setFindingStatusFilter(event.target.value)}><option value="ALL">All statuses</option><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option></select></label>
          <label><span>Importance</span><select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}><option value="ALL">All levels</option><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></label>
          <label><span>Estimate</span><select value={estimateFilter} onChange={(event) => setEstimateFilter(event.target.value)}><option value="ALL">All findings</option><option value="REQUIRED">Requires estimate</option><option value="NOT_REQUIRED">No estimate required</option></select></label>
        </div>
      </section>
      <div className="quality-main-grid">
        <section className="health-card quality-inspections-card">
          <div className="health-card-heading">
            <div>
              <h2>Inspection visits</h2>
              <p>
                {items.length} recorded visit{items.length === 1 ? "" : "s"}.
              </p>
            </div>
          </div>
          {dashboardItems.length === 0 ? (
            <p className="health-empty">No quality inspections recorded.</p>
          ) : (
            <div className="quality-visit-list">
              {dashboardItems.map((item) => (
                <article className="quality-visit-card" key={item.id}>
                  <div className="quality-visit-heading">
                    <div>
                      <span className="health-ticket-id">
                        {dateLabel(item.visitDate)}
                      </span>
                      <h3>{item.property.name}</h3>
                      <p>
                        {item.waterBody?.name || "Pool not specified"} -
                        Technician: {item.technicianName}
                      </p>
                    </div>
                    <div className="quality-visit-actions"><span className="quality-reading-count">{item.findings.filter((finding) => matchesFindingFilters(finding) && matchesDashboardFilter(finding)).length} finding{item.findings.filter((finding) => matchesFindingFilters(finding) && matchesDashboardFilter(finding)).length === 1 ? "" : "s"}</span>{isSuperAdmin && <button type="button" className="quality-delete-button" onClick={() => void deleteInspection(item.id)}>Delete</button>}</div>
                  </div>
                  <div className="quality-data-section"><strong>Readings</strong><div className="quality-reading-grid">
                    {Object.entries(item.readings || {})
                      .filter(([, value]) => value)
                      .map(([key, value]) => (
                        <span key={key}>
                          <small>{readingLabels[key] || key}</small>
                          <strong>{value}</strong>
                        </span>
                      ))}
                  </div></div>
                  <div className="quality-data-section"><strong>Dosages</strong><div className="quality-reading-grid quality-dosage-grid">
                    {Object.entries(item.dosages || {})
                      .filter(([, value]) => value)
                      .map(([key, value]) => (
                        <span key={key}>
                          <small>{dosageLabels[key] || key}</small>
                          <strong>{value}</strong>
                        </span>
                      ))}
                  </div></div>
                  {item.notes && <p className="quality-notes">{item.notes}</p>}
                  <div className="quality-findings-section">
                    <div className="quality-findings-heading"><strong>Findings</strong><button type="button" aria-expanded={expandedFindingGroups.has(item.id)} onClick={() => setExpandedFindingGroups((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })}>{item.findings.filter((finding) => matchesFindingFilters(finding) && matchesDashboardFilter(finding)).length} finding{item.findings.filter((finding) => matchesFindingFilters(finding) && matchesDashboardFilter(finding)).length === 1 ? "" : "s"}<span aria-hidden="true">{expandedFindingGroups.has(item.id) ? "⌃" : "⌄"}</span></button></div>
                    {expandedFindingGroups.has(item.id) && item.findings.filter((finding) => matchesFindingFilters(finding) && matchesDashboardFilter(finding)).map((finding, findingIndex) => {
                    const findingKey = finding.id || `${item.id}-${findingIndex}`;
                    const expanded = expandedFindingGroups.has(item.id);
                    return <div
                      className={
                        "quality-finding quality-finding-" + signal(finding) + (expanded ? " quality-finding-expanded" : "")
                      }
                      key={findingKey}
                    >
                      <i className="quality-signal-dot" />
                      <button type="button" className="quality-finding-toggle" aria-expanded={expanded} onClick={() => void toggleFindingGroup(item.id)}><span><strong>{finding.description}</strong><small>{severityLabel(finding.severity)}{finding.requiresEstimate ? " · Requires estimate" : ""}</small></span><b aria-hidden="true">{expanded ? "⌃" : "⌄"}</b></button>
                      {expanded && <div className="quality-finding-details" aria-live="polite">
                        {loadingFindingGroups.has(item.id) ? <p className="quality-findings-loading">Loading finding details…</p> : <>{finding.photos?.length > 0 && <div className="quality-finding-photos">{finding.photos.map((photo) => <img key={photo.name + photo.data.slice(-12)} src={photo.data} alt={photo.name} />)}</div>}<p>{finding.description}</p></>}
                      </div>}
                      {expanded && <span className="quality-severity">{severityLabel(finding.severity)}</span>}
                      {expanded && finding.requiresEstimate && <span className="quality-estimate-badge">Estimate</span>}
                      {expanded && <select aria-label="Update finding" value={finding.status} onChange={(event) => finding.id && void updateFinding(finding.id, event.target.value)}><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option></select>}
                      {expanded && isSuperAdmin && <button type="button" className="quality-delete-button" onClick={() => finding.id && void deleteFinding(finding.id)}>Delete</button>}
                    </div>
                  })}
                    {loadingFindingGroups.has(item.id) && <p className="quality-findings-loading">Loading finding details…</p>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        <aside className="health-card quality-findings-card">
          <div className="health-card-heading">
            <div>
              <h2>Open findings</h2>
              <p>Quality alerts by priority.</p>
            </div>
          </div>
          <div className="quality-filter-row">
            <select
              aria-label="Filter findings"
              value={findingFilter}
              onChange={(event) => setFindingFilter(event.target.value)}
            >
              <option value="ALL">All findings</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In progress</option>
            </select>
          </div>
          {filteredFindings.length === 0 ? (
            <p className="health-empty">No open findings.</p>
          ) : (
            filteredFindings.map(({ inspection, finding }) => (
              <button
                type="button"
                className={"quality-alert-row quality-alert-" + signal(finding)}
                key={finding.id}
              >
                <i className="quality-signal-dot" />
                <span>
                  <strong>{finding.description}</strong>
                  <small>
                    {inspection.property.name} -{" "}
                    {inspection.waterBody?.name || "Pool"}
                  </small>
                  <em>
                    {finding.status === "IN_PROGRESS" ? "In progress" : "Open"}{" "}
                    - {severityLabel(finding.severity)}
                  </em>
                </span>
              </button>
            ))
          )}
        </aside>
      </div>
      {editing && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            className="property-modal quality-editor-modal"
          >
            <div className="edit-panel-header">
              <h2>New quality inspection</h2>
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
              <label>
                Property
                <select
                  required
                  value={editing.propertyId}
                  onChange={(event) =>
                    update({ propertyId: event.target.value, waterBodyId: "" })
                  }
                >
                  <option value="">Select property</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </select>
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
                  {technicians.map((technician) => (
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
                  {busy ? "Saving..." : "Save inspection"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
