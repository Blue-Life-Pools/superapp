type Photo = { name: string; type: string; data: string };
type EditableFinding = {
  id?: string; title?: string; description: string; severity: string; status: string;
  responsibleName?: string | null; requiresEstimate: boolean; resolution?: string | null;
  resolvedAt?: string | null; estimateNumber?: string | null; estimateSentAt?: string | null;
  photos: Photo[]; photosChanged?: boolean;
};
type ReadingAlert = { message: string; level: string };

export function qualityFindingsPayload(findings: EditableFinding[], alerts: ReadingAlert[], originals: EditableFinding[] = []) {
  const existing = findings.find((finding) => finding.title?.trim() === 'Chemical readings alert');
  const original = originals.find((finding) => finding.id === existing?.id && finding.title?.trim() === 'Chemical readings alert');
  const generated = alerts.length ? {
    title: 'Chemical readings alert',
    description: `Automatic chemical alert: ${alerts.map((alert) => alert.message).join('; ')}`,
    severity: alerts.some((alert) => alert.level === 'alert') ? 'HIGH' : 'MEDIUM',
    status: 'OPEN', requiresEstimate: false, photos: [],
  } : null;
  const merged: EditableFinding[] = findings.map((finding) => {
    if (finding !== existing || !generated) return finding;
    return { ...finding,
      description: original && finding.description === original.description ? generated.description : finding.description,
      severity: original && finding.severity === original.severity ? generated.severity : finding.severity,
    };
  });
  if (!existing && generated) merged.push(generated);
  // Send only DTO fields. API response audit fields must not be submitted back.
  return merged.filter((finding) => finding.description.trim()).map((finding) => ({
    id: finding.id, title: finding.title?.trim() || 'Finding', description: finding.description.trim(),
    severity: finding.severity, status: finding.status, responsibleName: finding.responsibleName ?? null,
    requiresEstimate: finding.requiresEstimate, resolution: finding.resolution ?? null,
    resolvedAt: finding.resolvedAt ?? null, estimateNumber: finding.estimateNumber ?? null,
    estimateSentAt: finding.estimateSentAt ?? null,
    ...(!finding.id || finding.photosChanged ? { photos: finding.photos } : {}),
  }));
}

export function qualityVisitInput(value: string) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
export function qualityVisitInstant(value: string) { return new Date(`${value}-05:00`).toISOString(); }
