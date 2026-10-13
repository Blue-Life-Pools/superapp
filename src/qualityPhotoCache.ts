import { API_URL, apiFetch, getApiCacheVersion, getAppToken } from './api';

export type QualityPhoto = { name: string; data: string; type?: string };
type InspectionPhotos = { id: string; findings: Array<{ id: string; photos: QualityPhoto[] | null }> };
const cache = new Map<string, { expires: number; promise: Promise<InspectionPhotos>; size: number }>();
let scope = '';

export function loadQualityPhotos(inspectionId: string, revision: string) {
  const currentScope = `${getAppToken()}:${getApiCacheVersion()}`;
  if (currentScope !== scope) { cache.clear(); scope = currentScope; }
  const key = `${inspectionId}:${revision}`;
  const existing = cache.get(key);
  if (existing && existing.expires > Date.now()) return existing.promise;
  const entry = { expires: Date.now() + 5 * 60_000, size: 0, promise: Promise.resolve({} as InspectionPhotos) };
  entry.promise = apiFetch(`${API_URL}/quality-inspections/${encodeURIComponent(inspectionId)}/photos`).then(async (response) => {
    if (!response.ok) throw new Error('Could not load finding photos.');
    const value = await response.json() as InspectionPhotos;
    entry.size = value.findings.reduce((total, finding) => total + (finding.photos || []).reduce((bytes, photo) => bytes + photo.data.length * 2, 0), 0);
    // Bound image memory as well as the number of cached inspections.
    while (cache.get(key) === entry && (cache.size > 20 || [...cache.values()].reduce((total, item) => total + item.size, 0) > 16_000_000)) {
      cache.delete(cache.keys().next().value!);
    }
    return value;
  }).catch((error: unknown) => {
    if (cache.get(key) === entry) cache.delete(key);
    throw error;
  });
  cache.set(key, entry);
  return entry.promise;
}
