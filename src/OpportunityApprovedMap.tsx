import { useCallback, useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker, MarkerClusterGroup, TileLayer } from 'leaflet';
import type {} from 'leaflet.markercluster';
import type { GeoJsonObject } from 'geojson';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import floridaCounties from './data/florida-counties.json';
import { API_URL, apiFetch } from './api';
import { SearchField } from './SearchField';
import { WorkspaceIcon } from './WorkspaceIcon';
import { currency, opportunityText } from './opportunityFields';
import './OpportunityApprovedMap.css';

type MapEstimate = { id: string; estimateNumber: string | null; estimateAmount: string | null; status: string | null; name: string | null; creationDate: string | null; approvalDate: string | null };
export type ApprovedMapProperty = { id: string; propertyId: string | null; name: string; address: string | null; latitude: number | null; longitude: number | null; locationIssue: 'PROPERTY_NOT_LINKED' | 'ADDRESS_MISSING' | 'COORDINATES_MISSING' | null; estimates: MapEstimate[]; totalAmount: string | null; missingAmounts: number };
export type ApprovedMapData = { properties: ApprovedMapProperty[]; approvedStatuses: string[]; summary: { opportunities: number; properties: number; locatedProperties: number; unlocatedProperties: number; locatedOpportunities: number; totalAmount: string | null; missingAmounts: number } };
const mapsUrl = (property: ApprovedMapProperty) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(property.latitude !== null && property.longitude !== null ? `${property.latitude},${property.longitude}` : property.address || '')}`;
const locationLabels = { PROPERTY_NOT_LINKED: 'Link the property to locate it', ADDRESS_MISSING: 'Address not recorded', COORDINATES_MISSING: 'Coordinates not recorded' };
const nameKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const streetMapPreference = 'bluelife-opportunities-street-map-consent-v1';

function MapViewport({ properties, selectedId, onSelect, fitVersion, streetMapEnabled }: { properties: ApprovedMapProperty[]; selectedId: string | null; onSelect: (id: string) => void; fitVersion: number; streetMapEnabled: boolean }) {
  const element = useRef<HTMLDivElement>(null), map = useRef<LeafletMap | null>(null), layer = useRef<MarkerClusterGroup | null>(null), streets = useRef<TileLayer | null>(null);
  const leaflet = useRef<typeof import('leaflet') | null>(null), markers = useRef(new Map<string, { marker: Marker; number: number }>());
  const choose = useRef(onSelect), layout = useRef('');
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  choose.current = onSelect;
  useEffect(() => {
    let cancelled = false, observer: ResizeObserver | null = null;
    setFailed(false);
    void import('leaflet').then(async module => {
      if (cancelled || !element.current) return;
      const L = module.default || module;
      // Markercluster extends the same Leaflet instance used by this map.
      (window as Window & { L?: typeof L }).L = L;
      await import('leaflet.markercluster');
      if (cancelled || !element.current) return;
      leaflet.current = L;
      const instance = L.map(element.current, { scrollWheelZoom: false, zoomControl: true, maxZoom: 19 }).setView([27.95, -82.46], 10);
      map.current = instance;
      instance.createPane('local-overview'); instance.getPane('local-overview')!.style.zIndex = '190';
      L.geoJSON(floridaCounties as GeoJsonObject, { pane: 'local-overview', interactive: false, style: { color: '#cbd8e5', weight: 1, fillColor: '#fcfdff', fillOpacity: 1 }, attribution: 'Local overview · <a href="https://www.census.gov/geographies/mapping-files/time-series/geo/carto-boundary-file.html" target="_blank" rel="noopener">US Census</a>' }).addTo(instance);
      L.control.scale({ metric: false, imperial: true }).addTo(instance);
      layer.current = L.markerClusterGroup({ animate: false, showCoverageOnHover: false, maxClusterRadius: 42, iconCreateFunction: cluster => L.divIcon({ className: 'opportunity-map-cluster', html: `<span>${cluster.getChildCount()}</span>`, iconSize: [36, 36] }) }).addTo(instance);
      observer = new ResizeObserver(() => instance.invalidateSize({ pan: false })); observer.observe(element.current);
      setReady(true);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; observer?.disconnect(); map.current?.remove(); map.current = null; layer.current = null; streets.current = null; markers.current.clear(); layout.current = ''; setReady(false); };
  }, [attempt]);
  useEffect(() => {
    if (!ready || !map.current || !leaflet.current) return;
    // Third-party geographic requests start only after the user's explicit opt-in.
    if (streetMapEnabled && !streets.current) {
      streets.current = leaflet.current.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' }).addTo(map.current);
    } else if (!streetMapEnabled && streets.current) { streets.current.remove(); streets.current = null; }
  }, [streetMapEnabled, ready]);
  const icon = (number: number, selected: boolean) => leaflet.current!.divIcon({ className: `opportunity-map-pin${selected ? ' is-selected' : ''}`, html: `<span>${number}</span>`, iconSize: [29, 36], iconAnchor: [14, 34], popupAnchor: [0, -30] });
  useEffect(() => {
    if (!ready || !map.current || !layer.current || !leaflet.current) return;
    const L = leaflet.current; layer.current.clearLayers(); markers.current.clear();
    const points: [number, number][] = [];
    properties.filter(property => property.locationIssue === null && property.latitude !== null && property.longitude !== null).forEach((property, index) => {
      const point: [number, number] = [property.latitude!, property.longitude!]; points.push(point);
      const marker = L.marker(point, { icon: icon(index + 1, property.id === selectedId), title: `Locate ${property.name}`, keyboard: true }).addTo(layer.current!);
      marker.getElement()?.setAttribute('aria-label', `Locate ${property.name}`);
      const popup = document.createElement('div'); popup.className = 'opportunity-map-popup';
      const title = document.createElement('strong'); title.textContent = property.name; popup.append(title);
      const address = document.createElement('span'); address.textContent = property.address || 'Address not recorded'; popup.append(address);
      const count = document.createElement('span'); count.textContent = `${property.estimates.length} approved ${property.estimates.length === 1 ? 'estimate' : 'estimates'} · ${currency(property.totalAmount)}${property.missingAmounts && property.totalAmount !== null ? ' recorded' : ''}`; popup.append(count);
      const link = document.createElement('a'); link.href = mapsUrl(property); link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Open in Maps ↗'; popup.append(link);
      marker.bindPopup(popup, { minWidth: 210, maxWidth: 280 }).on('click', () => choose.current(property.id));
      markers.current.set(property.id, { marker, number: index + 1 });
    });
    const key = points.map(point => point.join(',')).join(';');
    if (points.length && key !== layout.current) { map.current.fitBounds(L.latLngBounds(points), { padding: [35, 35], maxZoom: 14 }); layout.current = key; }
    // Selection is applied separately so opening a property does not recreate the map.
  }, [properties, ready]);
  useEffect(() => {
    if (!ready || !map.current) return;
    for (const [id, item] of markers.current) { item.marker.setIcon(icon(item.number, id === selectedId)); item.marker.setZIndexOffset(id === selectedId ? 1000 : 0); }
    const selected = selectedId ? markers.current.get(selectedId) : undefined;
    if (selected) layer.current?.zoomToShowLayer(selected.marker, () => selected.marker.openPopup());
    else map.current.closePopup();
  }, [selectedId, ready, properties]);
  useEffect(() => {
    if (!fitVersion || !ready || !map.current || !leaflet.current || !markers.current.size) return;
    map.current.fitBounds(leaflet.current.latLngBounds([...markers.current.values()].map(item => item.marker.getLatLng())), { padding: [35, 35], maxZoom: 14 });
  }, [fitVersion, ready]);
  return <div className="opportunity-map-viewport"><div ref={element} role="region" aria-label="Map of approved properties" className="opportunity-map-canvas" />{!ready && <div className="opportunity-map-overlay" role="status">{failed ? <><span>Could not load the map.</span><button type="button" className="opportunities-text-action" onClick={() => setAttempt(value => value + 1)}>Retry map</button></> : 'Loading map…'}</div>}</div>;
}

export function OpportunityApprovedMap({ query, version, disabled, onOpenOpportunity }: { query: string; version: number; disabled: boolean; onOpenOpportunity: (id: string) => void }) {
  const [data, setData] = useState<ApprovedMapData | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null), [search, setSearch] = useState(''), [missingOnly, setMissingOnly] = useState(false), [fitVersion, setFitVersion] = useState(0);
  const [streetMapEnabled, setStreetMapEnabled] = useState(() => { try { return localStorage.getItem(streetMapPreference) === 'allowed'; } catch { return false; } });
  const [streetMapChoice, setStreetMapChoice] = useState(false);
  function changeStreetMap(enabled: boolean) { setStreetMapEnabled(enabled); setStreetMapChoice(false); try { if (enabled) localStorage.setItem(streetMapPreference, 'allowed'); else localStorage.removeItem(streetMapPreference); } catch { /* The current session still honors the choice. */ } }
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    void apiFetch(`${API_URL}/opportunities/approved-map?${query}`, { signal: controller.signal }).then(async response => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(result.properties) || !result.summary) throw new Error(typeof result.message === 'string' ? result.message : 'Could not load approved locations.');
      if (!controller.signal.aborted) { setData(result); setSelectedId(previous => result.properties.some((property: ApprovedMapProperty) => property.id === previous) ? previous : null); }
    }).catch((failure: Error) => { if (!controller.signal.aborted) setError(failure.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, version, attempt]);
  const chooseFromMap = useCallback((id: string) => { setSelectedId(id); setSearch(''); setMissingOnly(false); }, []);
  useEffect(() => {
    if (!list.current || !selectedId) return;
    const row = [...list.current.querySelectorAll<HTMLElement>('[data-location-id]')].find(element => element.dataset.locationId === selectedId);
    if (row) list.current.scrollTo({ top: Math.max(0, row.offsetTop - list.current.offsetTop - 6), behavior: 'smooth' });
  }, [selectedId, missingOnly, search]);
  const properties = data?.properties || [], rows = properties.filter(property => (!missingOnly || property.locationIssue !== null) && nameKey(`${property.name} ${property.address || ''}`).includes(nameKey(search)));
  const numbers = new Map(properties.filter(property => property.locationIssue === null).map((property, index) => [property.id, index + 1]));
  return <section className="opportunities-approved-map" aria-labelledby="opportunities-map-title" aria-busy={loading}>
    <header><div><span className="opportunities-map-icon"><WorkspaceIcon name="map" /></span><div><h2 id="opportunities-map-title">Approved opportunities</h2><p>Property locations for Accepted and Approved estimates. Uses the filters above.</p></div></div><div className="opportunities-map-heading-actions">{data && !loading && !error && <span>{data.summary.opportunities} estimates · {data.summary.properties} properties</span>}<button type="button" className="opportunities-button opportunities-button-secondary" aria-label="Fit all approved locations" disabled={loading || !!error || !data?.summary.locatedProperties} onClick={() => { setSelectedId(null); setFitVersion(value => value + 1); }}><WorkspaceIcon name="map" />Fit all</button></div></header>
    {error ? <div className="opportunities-map-message" role="alert"><span>{error}</span><button type="button" className="opportunities-text-action" onClick={() => setAttempt(value => value + 1)}>Retry locations</button></div> : !data ? <div className="opportunities-map-message" role="status">Loading approved locations…</div> : !properties.length ? <div className="opportunities-map-message">No approved opportunities match these filters.</div> : <div className={`opportunities-map-layout${loading ? ' is-updating' : ''}`}>
      {data.summary.locatedProperties ? <MapViewport properties={properties} selectedId={selectedId} onSelect={chooseFromMap} fitVersion={fitVersion} streetMapEnabled={streetMapEnabled} /> : <div className="opportunities-map-no-coordinates"><WorkspaceIcon name="pin" /><strong>No saved locations for these properties.</strong><span>Available addresses are listed beside the map.</span></div>}
      <aside aria-label="Approved properties" className="opportunities-map-sidebar"><SearchField aria-label="Search approved locations" placeholder="Find a property…" value={search} onChange={event => setSearch(event.target.value)} /><div className="opportunities-map-list-filters"><button type="button" aria-pressed={!missingOnly} onClick={() => setMissingOnly(false)}>All properties <span>{properties.length}</span></button><button type="button" aria-pressed={missingOnly} onClick={() => setMissingOnly(true)}>Needs location <span>{data.summary.unlocatedProperties}</span></button></div>
        <div className="opportunities-map-property-list" ref={list}>{rows.length ? rows.map(property => <article key={property.id} data-location-id={property.id} className={selectedId === property.id ? 'is-selected' : ''}><button type="button" className="opportunities-map-property" aria-expanded={selectedId === property.id} aria-label={`Show approved estimates for ${property.name}`} disabled={disabled || loading} onClick={() => setSelectedId(current => current === property.id ? null : property.id)}><span className={`opportunities-map-number${property.locationIssue ? ' is-missing' : ''}`}>{numbers.get(property.id) || <WorkspaceIcon name="pin" />}</span><span><strong>{property.name}</strong><small>{property.estimates.length} approved {property.estimates.length === 1 ? 'estimate' : 'estimates'} · {currency(property.totalAmount)}{property.missingAmounts > 0 && property.totalAmount !== null ? ' recorded' : ''}</small></span><WorkspaceIcon name="chevron-right" /></button>
          {selectedId === property.id && <div className="opportunities-map-property-detail"><p>{property.address || 'Address not recorded'}</p>{property.locationIssue && <p className="opportunities-map-location-note"><WorkspaceIcon name="info" />{locationLabels[property.locationIssue]}</p>}{(property.address || property.latitude !== null) && <a href={mapsUrl(property)} target="_blank" rel="noreferrer">Open in Maps <WorkspaceIcon name="external" /></a>}<div className="opportunities-map-estimates">{property.estimates.map(estimate => <button type="button" key={estimate.id} disabled={disabled || loading} onClick={() => onOpenOpportunity(estimate.id)} aria-label={`View approved estimate ${estimate.estimateNumber || estimate.id}`}><span><strong>Estimate {estimate.estimateNumber ? `#${estimate.estimateNumber}` : '—'}</strong><small>{opportunityText(estimate.name) || 'Description not recorded'}</small></span><span>{currency(estimate.estimateAmount)}<WorkspaceIcon name="external" /></span></button>)}</div>{property.missingAmounts > 0 && <small className="opportunities-map-amount-note">{property.missingAmounts} estimate {property.missingAmounts === 1 ? 'amount is' : 'amounts are'} not recorded.</small>}</div>}
        </article>) : <p className="opportunities-map-list-empty">No properties match this search.</p>}</div>
      </aside>
    </div>}
    {data && !error && <footer><span><i />{data.summary.locatedProperties} properties located</span>{data.summary.unlocatedProperties > 0 && <button type="button" onClick={() => setMissingOnly(true)}>{data.summary.unlocatedProperties} need location details</button>}{data.summary.locatedProperties > 0 && <button type="button" className="opportunities-map-basemap-choice" aria-expanded={!streetMapEnabled && streetMapChoice} onClick={() => streetMapEnabled ? changeStreetMap(false) : setStreetMapChoice(value => !value)}>{streetMapEnabled ? 'Use local map' : 'Enable street map'}</button>}</footer>}
    {streetMapChoice && !streetMapEnabled && <div className="opportunities-map-consent"><p>OpenStreetMap receives requests for the geographic area you view. Customer names, estimates and amounts stay in this application.</p><div><button type="button" className="opportunities-button opportunities-button-secondary" onClick={() => setStreetMapChoice(false)}>Keep local map</button><button type="button" className="opportunities-button opportunities-button-primary" onClick={() => changeStreetMap(true)}>Allow OpenStreetMap</button></div></div>}
  </section>;
}
