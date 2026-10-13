import { useEffect, useRef, useState } from 'react';
import { loadQualityPhotos, type QualityPhoto } from './qualityPhotoCache';
import './QualityFindingPhotos.css';

// One shared request per inspection, only after a finding enters the viewport.
export function QualityFindingPhotos({ inspectionId, findingId, revision, onPreview }: {
  inspectionId: string; findingId?: string; revision: string; onPreview: (photo: QualityPhoto) => void;
}) {
  const target = useRef<HTMLDivElement>(null);
  const [photos, setPhotos] = useState<QualityPhoto[]>([]);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!findingId) return;
    let cancelled = false;
    let started = false;
    const load = () => {
      if (started) return;
      started = true;
      void loadQualityPhotos(inspectionId, revision).then((result) => {
        if (!cancelled) { setPhotos(result.findings.find((finding) => finding.id === findingId)?.photos || []); setError(false); }
      }).catch(() => { if (!cancelled) setError(true); });
    };
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { load(); observer?.disconnect(); }
    }, { rootMargin: '100px' });
    if (observer && target.current) observer.observe(target.current);
    else load();
    return () => { cancelled = true; observer?.disconnect(); };
  }, [inspectionId, findingId, revision, attempt]);
  return <div ref={target} className="quality-lazy-photos">
    {error && <button type="button" onClick={() => { setError(false); setAttempt((value) => value + 1); }}>Retry photos</button>}
    {photos.map((photo, index) => <button type="button" className="quality-photo-preview" key={`${photo.name}-${index}`} onClick={() => onPreview(photo)} aria-label={`View ${photo.name || 'finding photo'}`}><img loading="lazy" src={photo.data} alt={photo.name || 'Finding'} /></button>)}
  </div>;
}
