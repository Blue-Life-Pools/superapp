export type QualityDateBasis = "AUTO" | "VISIT" | "RESOLVED";

type Finding = {
  status: string;
  severity: string;
  requiresEstimate: boolean;
  resolvedAt?: string | null;
};

type Inspection = {
  propertyId: string;
  technicianName: string;
  visitDate: string;
  findings: Finding[];
};

export type QualityFilters = {
  property: string;
  technician: string;
  status: string;
  severity: string;
  estimate: string;
  dashboard: string;
  dateBasis: QualityDateBasis;
  dateMode: string;
  day: string;
  from: string;
  to: string;
};

export function qualityDateBasis(filters: Pick<QualityFilters, "dateBasis" | "dashboard" | "status">) {
  if (filters.dateBasis !== "AUTO") return filters.dateBasis;
  return filters.dashboard === "SOLVED" || filters.status === "RESOLVED" ? "RESOLVED" : "VISIT";
}

function dateKey(value?: string | null) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  return ["year", "month", "day"].map((part) => parts.find((item) => item.type === part)!.value).join("-");
}

export function filterQualityInspections<T extends Inspection>(items: readonly T[], filters: QualityFilters): T[] {
  const basis = qualityDateBasis(filters);
  const hasDates = Boolean(filters.dateMode === "DAY" && filters.day || filters.dateMode === "RANGE" && (filters.from || filters.to));
  const matchesDate = (value?: string | null) => {
    if (!hasDates) return true;
    const date = dateKey(value);
    if (!date) return false;
    if (filters.dateMode === "DAY") return date === filters.day;
    return (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to);
  };
  const hasFindingFilters = filters.status !== "ALL" || filters.severity !== "ALL" || filters.estimate !== "ALL" || basis === "RESOLVED" && hasDates;
  return items.flatMap((inspection) => {
    if (filters.property !== "ALL" && inspection.propertyId !== filters.property) return [];
    if (filters.technician !== "ALL" && inspection.technicianName !== filters.technician) return [];
    if (basis === "VISIT" && !matchesDate(inspection.visitDate)) return [];
    const findings = inspection.findings.filter((finding) =>
      (filters.status === "ALL" || finding.status === filters.status) &&
      (filters.severity === "ALL" || finding.severity === filters.severity) &&
      (filters.estimate === "ALL" || (filters.estimate === "REQUIRED" ? finding.requiresEstimate : !finding.requiresEstimate)) &&
      (basis !== "RESOLVED" || !hasDates || finding.status === "RESOLVED" && matchesDate(finding.resolvedAt)),
    );
    if (!findings.length && (inspection.findings.length > 0 || hasFindingFilters)) return [];
    return [{ ...inspection, findings }];
  });
}
