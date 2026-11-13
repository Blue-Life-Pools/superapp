import { useEffect, useMemo, useState } from 'react';
import { API_URL, apiFetch as fetch, getAppToken, setAppToken } from './api';
import type { ProposalPdfData } from './proposalPdf';
import { ProposalCalculator } from './ProposalCalculator';
import { ProposalInternalNameEditor } from './ProposalInternalNameEditor';
import { calculateProposal, calculatorRates, chemicalRatesBySize, defaultProposalOverhead, poolBasePrices } from './proposalCostModel';
import type { ProposalContext, ProposalOverheadSettings, ProposalWaterBody } from './proposalCostModel';
import { proposalServiceOptions, type ProposalService } from './proposalServices';
import { ChemicalsPage } from './ChemicalsPage';
import { HealthDepartmentPage } from './HealthDepartmentPage';
import { PropertyHistoryPage } from './PropertyHistoryPage';
import { ReportsPage } from './ReportsPage';
import { LoginPage, type AppSession } from './LoginPage';
import { ComplaintsPage } from './ComplaintsPage';
import { QualityInspectionsPage } from './QualityInspectionsPage';
import { OpportunitiesPage } from './OpportunitiesPage';
import { QualityFindingPhotos } from './QualityFindingPhotos';
import './App.css';
import './PropertyHistoryPage.css';
import { WorkspaceIcon } from './WorkspaceIcon';
import { SearchField } from './SearchField';
import { CommercialDashboard, CommercialPeriodFilter } from './CommercialDashboard';
import { buildCommercialStats, commercialProposalMonths, commercialProposalTrend, proposalInPeriod } from './commercialDashboardData';
import './CommercialDashboard.css';
import { CommercialPropertyOverview } from './CommercialPropertyOverview';
import './CommercialPropertyOverview.css';
import './WorkspaceSidebar.css';
import './ChemicalsWorkspace.css';

type AppArea = 'home' | 'commercial' | 'opportunities' | 'chemicals' | 'health' | 'reports' | 'complaints' | 'quality';
type PropertyTab = 'overview' | 'commercial' | 'estimates' | 'contracts' | 'quality';

function initialAppArea(): AppArea {
  const query = new URLSearchParams(window.location.search);
  const sharedChemicalAccess = query.get('technicianAccess') === '1' || Boolean(query.get('technicianToken')?.trim());
  return sharedChemicalAccess ? 'chemicals' : 'home';
}

function hasSharedChemicalAccess() {
  const query = new URLSearchParams(window.location.search);
  return query.get('technicianAccess') === '1' || Boolean(query.get('technicianToken')?.trim());
}

type ContactRelation = {
  id: string;
  role: string | null;
  isPrimary: boolean;
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  };
};

type WaterBody = {
  id: string;
  name: string;
  technicianName: string | null;
  type: string;
  size: string | null;
  gallons: number | null;
  active: boolean;
};

type QuickBooksEstimateLine = {
  id: string;
  lineNumber: number;
  itemRefId: string | null;
  itemName: string | null;
  description: string | null;
  quantity: string | number | null;
  unitPrice: string | number | null;
  amount: string | number | null;
  taxCode: string | null;
};

type QuickBooksEstimate = {
  id: string;
  estimateNumber: string;
  status: string;
  estimateDate: string | null;
  totalAmount: string | number | null;
  subtotalAmount: string | number | null;
  taxAmount: string | number | null;
  customerMemo: string | null;
  lastSyncedAt: string | null;
  lines: QuickBooksEstimateLine[];
};

type SalesActivityStatus = 'CREATED' | 'SENT' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

type ProposalFollowUp = {
  id: string;
  occurredAt: string;
  notes: string | null;
  channel: string;
};

type StoredProposalData = Partial<Omit<ProposalPdfData, 'proposalDate'>> & {
  proposalDate?: string;
  internalName?: string | null;
};

type SalesActivity = {
  id: string;
  type: string;
  occurredAt: string;
  notes: string | null;
  status: SalesActivityStatus;
  sentAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  proposalData?: StoredProposalData | null;
  emailDraftId?: string | null;
  emailDraftWebUrl?: string | null;
  emailDraftCreatedAt?: string | null;
  emailDraftFileName?: string | null;
  proposalPdfSharepointId?: string | null;
  proposalPdfSharepointUrl?: string | null;
  proposalPdfFileName?: string | null;
  proposalPdfUploadedAt?: string | null;
  followUps?: ProposalFollowUp[];
};

function proposalPdfDataFromActivity(activity: SalesActivity): ProposalPdfData | null {
  const data = activity.proposalData;
  if (
    !data ||
    typeof data.proposalNumber !== 'string' ||
    typeof data.propertyName !== 'string' ||
    typeof data.proposalDate !== 'string' ||
    !Array.isArray(data.waterBodies) ||
    !Array.isArray(data.services)
  ) {
    return null;
  }

  const proposalDate = new Date(data.proposalDate);
  if (Number.isNaN(proposalDate.getTime())) return null;

  return {
    proposalNumber: data.proposalNumber,
    proposalDate,
    clientName: data.clientName ?? '-',
    propertyName: data.propertyName,
    address: data.address ?? '-',
    contactName: data.contactName ?? '-',
    email: data.email ?? '-',
    phone: data.phone ?? '-',
    waterBodies: data.waterBodies,
    services: data.services,
    monthlyTransportationCost: data.monthlyTransportationCost ?? 0,
    discountPercentage: data.discountPercentage ?? 0,
    totalMonthlyInvestment: data.totalMonthlyInvestment ?? 0,
  };
}

const proposalBoardStatuses: SalesActivityStatus[] = [
  'CREATED',
  'SENT',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
];

const automaticWaterBodyPrices: Record<string, number> = {
  SPA: 250,
  KIDDIE_POOL: 400,
  SPLASH_PAD: 400,
  DECORATIVE_WATER_FEATURE: 150,
};

const vipDiscountPercentage = 20;


function propertyNameKey(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function deduplicateProperties(rows: Property[]) {
  const unique = new Map<string, Property>();
  for (const row of rows) {
    const key = propertyNameKey(row.name);
    const existing = unique.get(key);
    if (!existing) {
      unique.set(key, row);
      continue;
    }
    const completeness = (property: Property) => Number(Boolean(property.addressLine1)) + Number(Boolean(property.city)) + Number(Boolean(property.state)) + Number(Boolean(property.zipCode)) + Number(Boolean(property.managementCompany?.name)) + property.contacts.length + property.waterBodies.length + property.salesActivities.length;
    const winner = completeness(row) > completeness(existing) ? row : existing;
    const other = winner.id === row.id ? existing : row;
    unique.set(key, {
      ...winner,
      contacts: [...winner.contacts, ...other.contacts.filter((contact) => !winner.contacts.some((current) => current.id === contact.id))],
      waterBodies: [...winner.waterBodies, ...other.waterBodies.filter((body) => !winner.waterBodies.some((current) => current.id === body.id))],
      salesActivities: [...winner.salesActivities, ...other.salesActivities.filter((activity) => !winner.salesActivities.some((current) => current.id === activity.id))],
    });
  }
  return [...unique.values()];
}

type Property = {
  id: string;
  createdAt?: string;
  name: string;
  code: string | null;
  lifecycleStatus: string;
  serviceStartDate: string | null;
  leadSource: string | null;
  propertyType: string | null;
  segment: string | null;

  addressLine1: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
  zipCode: string | null;

  sharepointFolderUrl: string | null;
  maintenanceChiefInfo: string | null;
  followUpNotes: string | null;
  deletedAt?: string | null;

  managementCompany: {
    id: string;
    name: string;
  } | null;

  contacts: ContactRelation[];
  waterBodies: WaterBody[];
  salesActivities: SalesActivity[];
  quickbooksEstimates: QuickBooksEstimate[];
};

type PropertyQualityInspection = {
  id: string;
  propertyId: string;
  visitDate: string;
  updatedAt?: string;
  technicianName: string;
  waterBody?: { name: string } | null;
  readings: Record<string, string> | null;
  dosages: Record<string, string> | null;
  notes: string | null;
  findings: Array<{
    id?: string;
    description: string;
    severity: string;
    status: string;
    requiresEstimate: boolean;
    resolvedByName?: string | null;
    resolutionUpdatedByName?: string | null;
    photos?: Array<{ name: string; data: string }>;
  }>;
};

type PropertyReadingLevel = 'normal' | 'warning' | 'alert';

function propertyReadingLevel(key: string, rawValue: string): PropertyReadingLevel {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return 'normal';
  if (key === 'pH') return value < 7 || value > 7.8 ? 'alert' : value < 7.1 || value > 7.7 ? 'warning' : 'normal';
  if (key === 'Chlorine') return value === 0 || value > 7 ? 'alert' : value <= 1 || value >= 6 ? 'warning' : 'normal';
  if (key === 'Salt') return value > 4500 ? 'alert' : value >= 4000 ? 'warning' : 'normal';
  if (key === 'Calcium') return value > 500 ? 'alert' : value >= 450 ? 'warning' : 'normal';
  if (key === 'Alkalinity') return value < 80 || value > 120 ? 'alert' : value < 90 || value > 110 ? 'warning' : 'normal';
  if (key === 'Phosphates') return value > 300 ? 'alert' : value >= 200 ? 'warning' : 'normal';
  if (key === 'Stabilizer') return value < 30 || value > 60 ? 'alert' : value < 40 || value > 50 ? 'warning' : 'normal';
  if (key === 'Saturation index') return value < -0.3 || value > 0.3 ? 'alert' : value <= -0.25 || value >= 0.25 ? 'warning' : 'normal';
  if (key === 'Temperature') return value > 104 ? 'alert' : value >= 101 ? 'warning' : 'normal';
  return 'normal';
}

type EditPropertyForm = {
  name: string;
  leadSource: string;
  propertyType: string;
  segment: string;
  serviceStartDate: string;
  managementCompanyName: string;

  addressLine1: string;
  city: string;
  county: string;
  state: string;
  zipCode: string;

  sharepointFolderUrl: string;
  maintenanceChiefInfo: string;
};

type PropertyForm = Omit<EditPropertyForm, 'serviceStartDate'>;

type ContactForm = {
  firstName: string;
  lastName: string;
  role: string;
  email: string;
  phone: string;
  isPrimary: boolean;
};

type EditContactForm = ContactForm & {
  contactId?: string;
};

type WaterBodyForm = {
  id?: string;
  name: string;
  technicianName: string;
  type: string;
  size: string;
  gallons: string;
  photoFiles?: File[];
};

const emptyWaterBodyForm: WaterBodyForm = {
  name: '',
  technicianName: '',
  type: 'SWIMMING_POOL',
  size: 'MEDIUM',
  gallons: '',
  photoFiles: [],
};

function isWaterBodyFormValid(waterBody: WaterBodyForm) {
  const gallons = waterBody.gallons.trim();
  const gallonsAreValid =
    gallons === '' || (/^\d+$/.test(gallons) && Number(gallons) > 0);

  return Boolean(
    waterBody.type &&
    waterBody.name.trim() &&
    gallonsAreValid,
  );
}

const emptyPropertyForm: PropertyForm = {
  name: '',
  leadSource: '',
  propertyType: '',
  segment: '',
  managementCompanyName: '',
  addressLine1: '',
  city: '',
  county: '',
  state: '',
  zipCode: '',
  sharepointFolderUrl: '',
  maintenanceChiefInfo: '',
};

const emptyContactForm: ContactForm = {
  firstName: '',
  lastName: '',
  role: 'PROPERTY_MANAGER',
  email: '',
  phone: '',
  isPrimary: true,
};

const requiredPropertyFields: Array<keyof PropertyForm> = [
  'name',
  'leadSource',
  'propertyType',
  'segment',
  'addressLine1',
  'city',
  'county',
  'state',
  'zipCode',
];

function formatLabel(value: string | null) {
  if (!value) return '-';

  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function propertySku(id: string) {
  return id.slice(0, 7).toLowerCase();
}

function isValidHttpUrl(value: string) {
  if (!value.trim()) return true;

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizePropertyMatchValue(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function propertyToForm(
  property: Property,
): EditPropertyForm {
  return {
    name: property.name ?? '',
    leadSource: property.leadSource ?? '',
    propertyType: property.propertyType ?? '',
    segment: property.segment ?? '',
    serviceStartDate: property.serviceStartDate?.slice(0, 10) ?? '',
    managementCompanyName: property.managementCompany?.name ?? '',

    addressLine1: property.addressLine1 ?? '',
    city: property.city ?? '',
    county: property.county ?? '',
    state: property.state ?? '',
    zipCode: property.zipCode ?? '',

    sharepointFolderUrl:
      property.sharepointFolderUrl ?? '',

    maintenanceChiefInfo:
      property.maintenanceChiefInfo ?? '',
  };
}

function WaterBodiesEditor({
  bodies,
  idPrefix,
  onAdd,
  onUpdate,
  onRemove,
  onFilesSelected,
}: {
  bodies: WaterBodyForm[];
  idPrefix: string;
  onAdd: () => void;
  onUpdate: (
    index: number,
    field: keyof WaterBodyForm,
    value: string,
  ) => void;
  onRemove: (index: number) => void;
  onFilesSelected?: (index: number, files: File[]) => void;
}) {
  const counts = bodies.reduce<Record<string, number>>(
    (result, body) => ({
      ...result,
      [body.type]: (result[body.type] ?? 0) + 1,
    }),
    {},
  );

  return (
    <>
      <div className="form-section-title form-field-wide">
        <div>
          <h3>Water Bodies</h3>
          <p>Add each pool, spa or fountain separately.</p>
        </div>
        <button className="secondary-button" type="button" onClick={onAdd}>
          + Add water body
        </button>
      </div>

      <div className="water-bodies-editor form-field-wide">
        {bodies.length === 0 ? (
          <p className="empty-text">No water bodies added.</p>
        ) : (
          <>
            <div className="water-body-summary">
              {Object.entries(counts).map(([type, count]) => (
                <span className="tag" key={type}>
                  {count} {formatLabel(type)}{count > 1 ? 's' : ''}
                </span>
              ))}
            </div>

            {bodies.map((body, index) => (
              <div
                className={`water-body-editor${body.type === 'SPA' ? ' water-body-editor-spa' : ''}`}
                key={`${idPrefix}-${index}`}
              >
                <div className="form-field water-body-type-field">
                  <label htmlFor={`${idPrefix}-type-${index}`}>Type *</label>
                  <select
                    id={`${idPrefix}-type-${index}`}
                    value={body.type}
                    onChange={(event) =>
                      onUpdate(index, 'type', event.target.value)
                    }
                  >
                    <option value="SWIMMING_POOL">Swimming Pool</option>
                    <option value="SPA">Spa</option>
                    <option value="KIDDIE_POOL">Kiddie Pool</option>
                    <option value="SPLASH_PAD">Splash Pad</option>
                    <option value="DECORATIVE_WATER_FEATURE">
                      Decorative Water Feature
                    </option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div className="form-field water-body-name-field">
                  <label htmlFor={`${idPrefix}-name-${index}`}>
                    Name or identifier *
                  </label>
                  <input
                    id={`${idPrefix}-name-${index}`}
                    placeholder="Example: Main Pool or North Spa"
                    value={body.name}
                    onChange={(event) =>
                      onUpdate(index, 'name', event.target.value)
                    }
                  />
                </div>

                <div className="form-field water-body-technician-field">
                  <label htmlFor={`${idPrefix}-technician-${index}`}>
                    Technician name (optional)
                  </label>
                  <input
                    id={`${idPrefix}-technician-${index}`}
                    placeholder="Name of the pool technician"
                    value={body.technicianName}
                    onChange={(event) =>
                      onUpdate(index, 'technicianName', event.target.value)
                    }
                  />
                </div>

                {body.type !== 'SPA' && (
                  <div className="form-field water-body-size-field">
                    <label htmlFor={`${idPrefix}-size-${index}`}>
                      Size (optional)
                    </label>
                    <select
                      id={`${idPrefix}-size-${index}`}
                      value={body.size}
                      onChange={(event) =>
                        onUpdate(index, 'size', event.target.value)
                      }
                    >
                      <option value="">Select size</option>
                      <option value="SMALL">Small</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="LARGE">Large</option>
                      <option value="EXTRA_LARGE">Extra Large</option>
                    </select>
                  </div>
                )}

                <div className="form-field water-body-gallons-field">
                  <label htmlFor={`${idPrefix}-gallons-${index}`}>
                    Gallons (optional)
                  </label>
                  <input
                    id={`${idPrefix}-gallons-${index}`}
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    placeholder="Example: 15000"
                    value={body.gallons}
                    onChange={(event) =>
                      onUpdate(index, 'gallons', event.target.value)
                    }
                  />
                  {body.gallons &&
                    (!/^\d+$/.test(body.gallons) || Number(body.gallons) <= 0) && (
                      <span className="field-error">
                        Enter a whole number greater than zero.
                      </span>
                    )}
                </div>

                <button
                  className="delete-button water-body-remove"
                  type="button"
                  onClick={() => onRemove(index)}
                >
                  Remove
                </button>

                {onFilesSelected && (
                  <div className="form-field form-field-wide water-body-photo-field">
                    <label htmlFor={`${idPrefix}-photos-${index}`}>
                      Photos (optional)
                    </label>
                    <input
                      id={`${idPrefix}-photos-${index}`}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(event) =>
                        onFilesSelected(
                          index,
                          Array.from(event.target.files ?? []),
                        )
                      }
                    />
                    <small className="water-body-photo-help">
                      {body.photoFiles?.length
                        ? `${body.photoFiles.length} photo${body.photoFiles.length === 1 ? '' : 's'} selected. They will be uploaded when you save the property.`
                        : 'Select one or more photos for this water body.'}
                    </small>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}

function formatDashboardCurrency(value: number) {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function proposalStatusLabel(status: SalesActivityStatus) {
  return status === 'SENT' ? 'Sent - No Response' : formatLabel(status);
}

async function uploadWaterBodyPhotoFiles(
  propertyId: string,
  waterBodyId: string,
  files: File[],
) {
  let failures = 0;

  for (const file of files) {
    try {
      const formData = new FormData();
      formData.append('file', file, file.name);
      const response = await fetch(
        `${API_URL}/properties/${propertyId}/water-bodies/${waterBodyId}/photos`,
        {
          method: 'POST',
          body: formData,
        },
      );

      if (!response.ok) {
        throw new Error(`Photo upload failed (${response.status})`);
      }
    } catch (error) {
      failures += 1;
      console.error(error);
    }
  }

  return failures;
}

function App() {
  const [sharedChemicalAccess] = useState(hasSharedChemicalAccess);
  const [appSession, setAppSession] = useState<AppSession | null>(null);
  const [authLoading, setAuthLoading] = useState(!sharedChemicalAccess);
  const [activeArea, setActiveArea] = useState<AppArea>(initialAppArea);
  const [healthUnassignedOnly, setHealthUnassignedOnly] = useState(false);
  const [reportsUnassignedOnly, setReportsUnassignedOnly] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return window.localStorage.getItem('bluelife-sidebar-collapsed') === 'true'; }
    catch { return false; }
  });
  const [propertyTab, setPropertyTab] = useState<PropertyTab>('overview');
  const [properties, setProperties] =
    useState<Property[]>([]);

  useEffect(() => {
    if (sharedChemicalAccess) return;
    if (!getAppToken()) {
      setAuthLoading(false);
      return;
    }

    async function restoreSession() {
      try {
        const response = await fetch(`${API_URL}/auth/session`);
        if (!response.ok) throw new Error('Session expired.');
        setAppSession(await response.json() as AppSession);
      } catch {
        setAppToken('');
        setAppSession(null);
      } finally {
        setAuthLoading(false);
      }
    }

    void restoreSession();
  }, [sharedChemicalAccess]);

  useEffect(() => {
    document.body.classList.toggle('sidebar-collapsed', sidebarCollapsed);
    try { window.localStorage.setItem('bluelife-sidebar-collapsed', String(sidebarCollapsed)); }
    catch { /* The layout still works when browser storage is unavailable. */ }
    return () => document.body.classList.remove('sidebar-collapsed');
  }, [sidebarCollapsed]);

  const [deletedProperties, setDeletedProperties] =
    useState<Property[]>([]);

  const [showDeleted, setShowDeleted] =
    useState(false);

  const [trashActionId, setTrashActionId] =
    useState<string | null>(null);

  const [, setLoading] =
    useState(false);

  const [search, setSearch] =
    useState('');

  const [commercialMonth, setCommercialMonth] = useState('all');

  const [proposalStatusFilter, setProposalStatusFilter] =
    useState<SalesActivityStatus | null>(null);

  const [
    selectedProperty,
    setSelectedProperty,
  ] = useState<Property | null>(null);

  const [
    detailLoading,
    setDetailLoading,
  ] = useState(false);

  const [propertyQualityInspections, setPropertyQualityInspections] =
    useState<PropertyQualityInspection[]>([]);
  const [propertyQualityLoading, setPropertyQualityLoading] = useState(false);
  const [propertyQualityError, setPropertyQualityError] = useState('');
  const [previewQualityPhoto, setPreviewQualityPhoto] = useState<{ name: string; data: string } | null>(null);

  const [
    isEditing,
    setIsEditing,
  ] = useState(false);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [creatingSharePointFolder, setCreatingSharePointFolder] =
    useState(false);

  const [showProposal, setShowProposal] = useState(false);
  const [showProposalReminders, setShowProposalReminders] = useState(false);
  const [reminderReferenceTime, setReminderReferenceTime] = useState(() => Date.now());
  const [focusedReminderActivityId, setFocusedReminderActivityId] = useState<string | null>(null);
  const [savingProposal, setSavingProposal] = useState(false);
  const [proposalFileAction, setProposalFileAction] = useState<{
    activityId: string;
    action: 'CREATE' | 'SAVE' | 'EMAIL';
  } | null>(null);
  const [locallyCreatedProposalIds, setLocallyCreatedProposalIds] = useState<string[]>([]);
  const [previewActivityId, setPreviewActivityId] = useState<string | null>(null);
  const [proposalDraftNotes, setProposalDraftNotes] = useState('');
  const [, setSavingProposalText] = useState(false);
  const [managementStatus, setManagementStatus] = useState('CURRENT');
  const [adjustments, setAdjustments] = useState('0');
  const [proposalNotes, setProposalNotes] = useState('');
  const [proposalInternalName, setProposalInternalName] = useState('');
  const [proposalWaterBodies, setProposalWaterBodies] = useState<
    ProposalWaterBody[]
  >([]);
  const [proposalServices, setProposalServices] = useState<ProposalService[]>(
    () => [...proposalServiceOptions],
  );
  const [proposalTargetMargin, setProposalTargetMargin] = useState(60);
  const [proposalContext, setProposalContext] = useState<ProposalContext | null>(null);
  const [proposalHistoryLoading, setProposalHistoryLoading] = useState(false);
  const [proposalHistoryError, setProposalHistoryError] = useState('');
  const [proposalHistoryRefresh, setProposalHistoryRefresh] = useState(0);
  const [proposalChemicalProjection, setProposalChemicalProjection] = useState<number | null>(null);
  const [proposalOverhead, setProposalOverhead] = useState<ProposalOverheadSettings>(() => ({ ...defaultProposalOverhead }));
  const proposalPropertyId = selectedProperty?.id;
  useEffect(() => {
    if (!showProposal || !proposalPropertyId) return;
    const controller = new AbortController();
    setProposalContext(null);
    setProposalHistoryLoading(true);
    setProposalHistoryError('');
    void fetch(`${API_URL}/properties/${proposalPropertyId}/proposal-context`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Could not load recorded costs. Size-based budgets are shown until history is available.');
        const context = await response.json() as ProposalContext;
        if (!context.chemicalHistory) throw new Error('Recorded history is unavailable. Review the chemical forecast before saving.');
        return context;
      })
      .then(context => { if (!controller.signal.aborted) setProposalContext(context); })
      .catch((error: Error) => { if (!controller.signal.aborted) setProposalHistoryError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setProposalHistoryLoading(false); });
    return () => controller.abort();
  }, [showProposal, proposalPropertyId, proposalHistoryRefresh]);

  useEffect(() => {
    if (!selectedProperty || propertyTab !== 'quality') return;

    let cancelled = false;
    setPropertyQualityLoading(true);
    setPropertyQualityError('');
    void fetch(`${API_URL}/quality-inspections?propertyId=${encodeURIComponent(selectedProperty.id)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load quality inspections.');
        return response.json() as Promise<PropertyQualityInspection[]>;
      })
      .then((items) => {
        if (cancelled) return;
        setPropertyQualityInspections(
          items.filter((item) => item.propertyId === selectedProperty.id),
        );
      })
      .catch((error: Error) => {
        if (!cancelled) setPropertyQualityError(error.message);
      })
      .finally(() => {
        if (!cancelled) setPropertyQualityLoading(false);
      });

    return () => { cancelled = true; };
  }, [propertyTab, selectedProperty]);

  const adjustmentPercentage =
    managementStatus === 'VIP' ? vipDiscountPercentage :
      managementStatus === 'NEGOTIATED' ? Math.min(100, Math.max(0, Number(adjustments || 0))) : 0;
  const proposalCalculatorSettings = {
    ...proposalOverhead,
    targetMarginPercent: proposalTargetMargin, discountPercent: adjustmentPercentage,
    surchargePercent: managementStatus === 'SURCHARGE' ? Math.min(100, Math.max(0, Number(adjustments || 0))) : 0,
    chemicalsIncluded: proposalServices.includes('Chemical Supply'),
    chemicalProjection: proposalChemicalProjection ?? proposalContext?.chemicalHistory.averageMonthlyCost ?? null,
  };
  const proposalCalculation = calculateProposal(proposalWaterBodies, proposalCalculatorSettings);
  // Gasoline is a configurable percentage of the final fee, included once.
  const monthlyTransportationCost = 0;
  const monthlyInvestment = proposalCalculation.total;
  const effectiveWaterBodyPrice = (body: ProposalWaterBody) => proposalCalculation.lines.find(line => line.body === body)?.grossPrice ?? 0;

  const [
    editForm,
    setEditForm,
  ] = useState<EditPropertyForm | null>(
    null,
  );

  const [editContacts, setEditContacts] =
    useState<EditContactForm[]>([]);

  const [editWaterBodies, setEditWaterBodies] =
    useState<WaterBodyForm[]>([]);

  const editContactEmails = editContacts.map((contact) =>
    contact.email.trim().toLowerCase(),
  );
  const editContactsAreValid =
    editContacts.some(
      (contact) => contact.role === 'PROPERTY_MANAGER',
    ) &&
    editContacts.every(
      (contact) =>
        Boolean(contact.role) &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          contact.email.trim(),
        ),
    ) &&
    new Set(editContactEmails).size === editContactEmails.length &&
    editContacts.filter((contact) => contact.isPrimary).length === 1;

  const [isCreating, setIsCreating] =
    useState(false);

  const [createReturnArea, setCreateReturnArea] =
    useState<AppArea | null>(null);

  const [possibleMatchesReviewed, setPossibleMatchesReviewed] =
    useState(false);

  const [creating, setCreating] =
    useState(false);

  const [createError, setCreateError] =
    useState('');

  const [createForm, setCreateForm] =
    useState<PropertyForm>(emptyPropertyForm);

  const [createContacts, setCreateContacts] =
    useState<ContactForm[]>([{ ...emptyContactForm }]);

  const [createWaterBodies, setCreateWaterBodies] =
    useState<WaterBodyForm[]>([]);

  const createWaterBodiesAreValid = createWaterBodies.every(
    isWaterBodyFormValid,
  );

  const editWaterBodiesAreValid = editWaterBodies.every(
    isWaterBodyFormValid,
  );

  const normalizedContactEmails = createContacts.map((contact) =>
    contact.email.trim().toLowerCase(),
  );
  const contactEmailsAreUnique =
    new Set(normalizedContactEmails).size ===
    normalizedContactEmails.length;
  const contactsAreValid =
    createContacts.some(
      (contact) => contact.role === 'PROPERTY_MANAGER',
    ) &&
    createContacts.every(
      (contact) =>
        Boolean(contact.role) &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          contact.email.trim(),
        ),
    ) &&
    contactEmailsAreUnique &&
    createContacts.filter((contact) => contact.isPrimary).length === 1;

  const possiblePropertyMatches = useMemo(() => {
    const name = normalizePropertyMatchValue(createForm.name);
    const address = normalizePropertyMatchValue(createForm.addressLine1);
    const city = normalizePropertyMatchValue(createForm.city);
    const state = normalizePropertyMatchValue(createForm.state);
    const zipCode = normalizePropertyMatchValue(createForm.zipCode);

    if (name.length < 4 && address.length < 5) return [];

    return [...properties, ...deletedProperties].flatMap((property) => {
      const propertyName = normalizePropertyMatchValue(property.name);
      const propertyAddress = normalizePropertyMatchValue(property.addressLine1);
      const propertyCity = normalizePropertyMatchValue(property.city);
      const propertyState = normalizePropertyMatchValue(property.state);
      const propertyZipCode = normalizePropertyMatchValue(property.zipCode);
      const sameName = Boolean(name) && propertyName === name;
      const similarName = name.length >= 5 &&
        (propertyName.includes(name) || name.includes(propertyName));
      const sameAddress = address.length >= 5 && propertyAddress === address;
      const sameLocation = sameAddress &&
        (!city || propertyCity === city) &&
        (!state || propertyState === state) &&
        (!zipCode || propertyZipCode === zipCode);
      const exact = sameName || (sameLocation && Boolean(zipCode));

      if (!sameName && !similarName && !sameAddress) return [];

      return [{
        property,
        exact,
        reason: sameName
          ? 'Same property name'
          : sameLocation
            ? 'Same address'
            : similarName
              ? 'Similar property name'
              : 'Similar address',
      }];
    }).slice(0, 5);
  }, [
    createForm.addressLine1,
    createForm.city,
    createForm.name,
    createForm.state,
    createForm.zipCode,
    deletedProperties,
    properties,
  ]);

  const hasExactPropertyMatch = possiblePropertyMatches.some(
    (match) => match.exact,
  );

  const createFormIsValid =
    requiredPropertyFields.every((field) =>
      createForm[field].trim(),
    ) &&
    /^[A-Za-z]{2}$/.test(createForm.state.trim()) &&
    /^\d{5}(-\d{4})?$/.test(createForm.zipCode.trim()) &&
    isValidHttpUrl(createForm.sharepointFolderUrl) &&
    contactsAreValid &&
    createWaterBodiesAreValid &&
    !hasExactPropertyMatch &&
    (possiblePropertyMatches.length === 0 || possibleMatchesReviewed);

  useEffect(() => {
    if (authLoading) return;
    if (sharedChemicalAccess || !appSession) {
      setLoading(false);
      return;
    }
    const userRole = appSession.user.role;

    async function loadProperties() {
      try {
        const [response, deletedResponse] = await Promise.all([
          fetch(`${API_URL}/properties`),
          ['COMMERCIAL', 'OPERATIONS_DIRECTOR', 'SUPER_ADMIN'].includes(userRole)
            ? fetch(`${API_URL}/properties/deleted`)
            : Promise.resolve(null),
        ]);

        if (!response.ok) {
          throw new Error(
            'Could not load properties',
          );
        }

        const data =
          await response.json();

        setProperties(deduplicateProperties(data as Property[]));

        if (deletedResponse?.ok) {
          setDeletedProperties(await deletedResponse.json());
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }

    void loadProperties();
  }, [appSession, authLoading, sharedChemicalAccess]);

  useEffect(() => {
    const timer = window.setInterval(
      () => setReminderReferenceTime(Date.now()),
      60 * 60 * 1000,
    );

    return () => window.clearInterval(timer);
  }, []);

  const filteredProperties =
    useMemo(() => {
      const term =
        search.trim().toLowerCase();

      if (!term) {
        return properties;
      }

      return properties.filter(
        (property) => {
          const values = [
            property.name,
            property.city,
            property.state,
            property.segment,
            property.propertyType,
            property.lifecycleStatus,
            property.managementCompany
              ?.name,
          ];

          return values.some(
            (value) =>
              value
                ?.toLowerCase()
                .includes(term),
          );
        },
      );
    }, [properties, search]);

  const displayedProperties = useMemo(() => {
    if (!proposalStatusFilter && commercialMonth === 'all') return filteredProperties;
    return filteredProperties.filter((property) => property.salesActivities.some((activity) =>
      proposalInPeriod(activity, commercialMonth) && (!proposalStatusFilter || (activity.status ?? 'CREATED') === proposalStatusFilter),
    ));
  }, [filteredProperties, proposalStatusFilter, commercialMonth]);

  const dashboardStats = useMemo(() => buildCommercialStats(filteredProperties, commercialMonth), [filteredProperties, commercialMonth]);
  const commercialMonths = useMemo(() => commercialProposalMonths(properties), [properties]);
  const commercialTrend = useMemo(() => commercialProposalTrend(filteredProperties, commercialMonth), [filteredProperties, commercialMonth]);

  const proposalReminders = useMemo(() => {
    const followUpThreshold = reminderReferenceTime - 30 * 24 * 60 * 60 * 1000;

    return properties.flatMap((property) =>
      property.salesActivities
        .filter((activity) => {
          if (activity.type !== 'PROPOSAL') return false;
          if (activity.status === 'EXPIRED') return true;
          return activity.status === 'SENT' &&
            Boolean(activity.sentAt) &&
            new Date(activity.sentAt as string).getTime() <= followUpThreshold;
        })
        .map((activity) => ({
          activity,
          property,
          contact: property.contacts.find((contact) => contact.isPrimary) ?? property.contacts[0],
        })),
    ).sort(
      (first, second) =>
        new Date(first.activity.sentAt ?? first.activity.occurredAt).getTime() -
        new Date(second.activity.sentAt ?? second.activity.occurredAt).getTime(),
    );
  }, [properties, reminderReferenceTime]);

  async function openProperty(
    id: string,
    reminderActivityId?: string,
  ) {
    try {
      setDetailLoading(true);

      const response = await fetch(
        `${API_URL}/properties/${id}`,
      );

      if (!response.ok) {
        throw new Error(
          'Could not load property details',
        );
      }

      const data =
        await response.json();

      setSelectedProperty(data);
      const previewActivity = reminderActivityId
        ? data.salesActivities.find((activity: SalesActivity) => activity.id === reminderActivityId)
        : data.salesActivities[0];
      setPreviewActivityId(previewActivity?.id ?? data.salesActivities[0]?.id ?? null);
      setProposalDraftNotes(previewActivity?.notes ?? data.salesActivities[0]?.notes ?? '');
      setFocusedReminderActivityId(reminderActivityId ?? null);
      setPropertyTab(reminderActivityId ? 'commercial' : 'overview');
      setIsEditing(false);
      setEditForm(null);
      setEditContacts([]);
      setEditWaterBodies([]);
    } catch (error) {
      console.error(error);
    } finally {
      setDetailLoading(false);
    }
  }

  function startEditing() {
    if (!selectedProperty) return;

    setEditForm(
      propertyToForm(
        selectedProperty,
      ),
    );

    setEditContacts(
      selectedProperty.contacts.length
        ? selectedProperty.contacts.map((relation) => ({
            contactId: relation.contact.id,
            firstName: relation.contact.firstName ?? '',
            lastName: relation.contact.lastName ?? '',
            role: relation.role ?? '',
            email: relation.contact.email ?? '',
            phone: relation.contact.phone ?? '',
            isPrimary: relation.isPrimary,
          }))
        : [{ ...emptyContactForm }],
    );
    setEditWaterBodies(
      selectedProperty.waterBodies.map((waterBody) => ({
        id: waterBody.id,
        name: waterBody.name,
        technicianName: waterBody.technicianName ?? '',
        type: waterBody.type,
        size: waterBody.type === 'SPA' ? '' : waterBody.size ?? 'MEDIUM',
        gallons: waterBody.gallons?.toString() ?? '',
        photoFiles: [],
      })),
    );

    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setEditForm(null);
    setEditContacts([]);
    setEditWaterBodies([]);
  }

  function updateField(
    field: keyof EditPropertyForm,
    value: string,
  ) {
    if (!editForm) return;

    setEditForm({
      ...editForm,
      [field]: value,
    });
  }

  function updateEditContact(
    index: number,
    field: keyof ContactForm,
    value: string | boolean,
  ) {
    setEditContacts((current) =>
      current.map((contact, contactIndex) => ({
        ...contact,
        ...(contactIndex === index ? { [field]: value } : {}),
        ...(field === 'isPrimary' && value === true
          ? { isPrimary: contactIndex === index }
          : {}),
      })),
    );
  }

  function addEditContact() {
    setEditContacts((current) => [
      ...current,
      { ...emptyContactForm, role: '', isPrimary: false },
    ]);
  }

  function removeEditContact(index: number) {
    setEditContacts((current) => {
      const remaining = current.filter(
        (_, contactIndex) => contactIndex !== index,
      );
      if (remaining.length && !remaining.some((contact) => contact.isPrimary)) {
        remaining[0] = { ...remaining[0], isPrimary: true };
      }
      return remaining;
    });
  }

  function updateWaterBody(
    mode: 'create' | 'edit',
    index: number,
    field: keyof WaterBodyForm,
    value: string,
  ) {
    const setter = mode === 'create' ? setCreateWaterBodies : setEditWaterBodies;
    setter((current) =>
      current.map((waterBody, waterBodyIndex) =>
        waterBodyIndex === index
          ? {
              ...waterBody,
              [field]: value,
              ...(field === 'type'
                ? {
                    size: value === 'SPA' ? '' : waterBody.size || 'MEDIUM',
                  }
                : {}),
            }
          : waterBody,
      ),
    );
  }

  function selectWaterBodyPhotos(
    mode: 'create' | 'edit',
    index: number,
    files: File[],
  ) {
    const setter = mode === 'create' ? setCreateWaterBodies : setEditWaterBodies;
    setter((current) =>
      current.map((waterBody, waterBodyIndex) =>
        waterBodyIndex === index
          ? { ...waterBody, photoFiles: files }
          : waterBody,
      ),
    );
    if (mode === 'create') setCreateError('');
  }

  function addWaterBody(mode: 'create' | 'edit') {
    const setter = mode === 'create' ? setCreateWaterBodies : setEditWaterBodies;
    setter((current) => [...current, { ...emptyWaterBodyForm }]);
  }

  function removeWaterBody(mode: 'create' | 'edit', index: number) {
    const setter = mode === 'create' ? setCreateWaterBodies : setEditWaterBodies;
    setter((current) =>
      current.filter((_, waterBodyIndex) => waterBodyIndex !== index),
    );
  }

  function updateCreateField(
    field: keyof PropertyForm,
    value: string,
  ) {
    setCreateForm((current) => ({
      ...current,
      [field]: value,
    }));
    if (['name', 'addressLine1', 'city', 'state', 'zipCode'].includes(field)) {
      setPossibleMatchesReviewed(false);
    }
    setCreateError('');
  }

  function updateContactField(
    index: number,
    field: keyof ContactForm,
    value: string | boolean,
  ) {
    setCreateContacts((current) =>
      current.map((contact, contactIndex) => ({
        ...contact,
        ...(contactIndex === index ? { [field]: value } : {}),
        ...(field === 'isPrimary' && value === true
          ? { isPrimary: contactIndex === index }
          : {}),
      })),
    );
    setCreateError('');
  }

  function addContact() {
    setCreateContacts((current) => [
      ...current,
      {
        ...emptyContactForm,
        role: '',
        isPrimary: false,
      },
    ]);
  }

  function removeContact(index: number) {
    setCreateContacts((current) => {
      const remaining = current.filter(
        (_, contactIndex) => contactIndex !== index,
      );

      if (remaining.length > 0 && !remaining.some((item) => item.isPrimary)) {
        const managerIndex = remaining.findIndex(
          (item) => item.role === 'PROPERTY_MANAGER',
        );
        remaining[managerIndex >= 0 ? managerIndex : 0] = {
          ...remaining[managerIndex >= 0 ? managerIndex : 0],
          isPrimary: true,
        };
      }

      return remaining;
    });
  }

  function openCreateForm(returnArea: AppArea | null = null) {
    setCreateReturnArea(returnArea);
    setPossibleMatchesReviewed(false);
    if (returnArea === 'home') navigateToArea('commercial');
    setIsCreating(true);
  }

  function closeCreateForm() {
    if (creating) return;

    const returnArea = createReturnArea;
    setIsCreating(false);
    setCreateReturnArea(null);
    setPossibleMatchesReviewed(false);
    setCreateForm(emptyPropertyForm);
    setCreateContacts([{ ...emptyContactForm }]);
    setCreateWaterBodies([]);
    setCreateError('');
    if (returnArea) navigateToArea(returnArea);
  }

  async function createProperty(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!createFormIsValid || creating) return;

    try {
      setCreating(true);
      setCreateError('');

      const response = await fetch(
        `${API_URL}/properties`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...createForm,
            name: createForm.name.trim(),
            addressLine1:
              createForm.addressLine1.trim(),
            city: createForm.city.trim(),
            county: createForm.county.trim(),
            state: createForm.state.trim(),
            zipCode: createForm.zipCode.trim(),
            managementCompanyName:
              createForm.managementCompanyName.trim() ||
              undefined,
            maintenanceChiefInfo:
              createForm.maintenanceChiefInfo.trim() ||
              undefined,
            contacts: createContacts.map((contact) => ({
              firstName: contact.firstName.trim() || undefined,
              lastName: contact.lastName.trim() || undefined,
              role: contact.role,
              email: contact.email.trim(),
              phone: contact.phone.trim() || undefined,
              isPrimary: contact.isPrimary,
            })),
            waterBodies: createWaterBodies.map((waterBody) => ({
              name: waterBody.name.trim(),
              technicianName: waterBody.technicianName.trim() || undefined,
              type: waterBody.type,
              size: waterBody.size || undefined,
              gallons: waterBody.gallons ? Number(waterBody.gallons) : undefined,
              active: true,
            })),
          }),
        },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string | string[] } | null;
        const message = Array.isArray(payload?.message) ? payload.message.join(' ') : payload?.message;
        throw new Error(message || 'Could not create property');
      }

      const createdProperty: Property =
        await response.json();

      let photoUploadFailures = 0;
      const usedWaterBodyIds = new Set<string>();
      for (let index = 0; index < createWaterBodies.length; index += 1) {
        const formWaterBody = createWaterBodies[index];
        const createdWaterBody = createdProperty.waterBodies.find(
          (candidate) =>
            candidate.name === formWaterBody.name.trim() &&
            !usedWaterBodyIds.has(candidate.id),
        );
        const files = formWaterBody.photoFiles ?? [];

        if (!createdWaterBody) {
          photoUploadFailures += files.length;
          continue;
        }
        usedWaterBodyIds.add(createdWaterBody.id);
        photoUploadFailures += await uploadWaterBodyPhotoFiles(
          createdProperty.id,
          createdWaterBody.id,
          files,
        );
      }

      setProperties((current) =>
        [...current, createdProperty].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      const returnArea = createReturnArea;
      setIsCreating(false);
      setCreateReturnArea(null);
      setPossibleMatchesReviewed(false);
      setCreateForm(emptyPropertyForm);
      setCreateContacts([{ ...emptyContactForm }]);
      setCreateWaterBodies([]);
      setCreateError('');

      if (returnArea) navigateToArea(returnArea);

      if (photoUploadFailures > 0) {
        window.alert(
          `Property created, but ${photoUploadFailures} photo${photoUploadFailures === 1 ? '' : 's'} could not be uploaded. You can try again later.`,
        );
      }
    } catch (error) {
      console.error(error);
      setCreateError(
        error instanceof Error
          ? error.message
          : 'The property could not be created. Check the information and try again.',
      );
    } finally {
      setCreating(false);
    }
  }

  async function moveSelectedPropertyToTrash() {
    if (!selectedProperty) return;

    const confirmed = window.confirm(
      `Move "${selectedProperty.name}" to Deleted Properties? You can restore it later.`,
    );
    if (!confirmed) return;

    try {
      setSaving(true);
      const response = await fetch(
        `${API_URL}/properties/${selectedProperty.id}`,
        { method: 'DELETE' },
      );
      if (!response.ok) throw new Error('Could not delete property');

      const deletedProperty = await response.json();
      setProperties((current) =>
        current.filter((property) => property.id !== deletedProperty.id),
      );
      setDeletedProperties((current) => [deletedProperty, ...current]);
      setSelectedProperty(null);
      setIsEditing(false);
    } catch (error) {
      console.error(error);
      window.alert('The property could not be moved to Deleted Properties.');
    } finally {
      setSaving(false);
    }
  }

  async function restoreProperty(property: Property) {
    try {
      setTrashActionId(property.id);
      const response = await fetch(
        `${API_URL}/properties/${property.id}/restore`,
        { method: 'PATCH' },
      );
      if (!response.ok) throw new Error('Could not restore property');

      const restored = await response.json();
      setDeletedProperties((current) =>
        current.filter((item) => item.id !== property.id),
      );
      setProperties((current) =>
        [...current, restored].sort((a, b) => a.name.localeCompare(b.name)),
      );
    } catch (error) {
      console.error(error);
      window.alert('The property could not be restored.');
    } finally {
      setTrashActionId(null);
    }
  }

  async function permanentlyDeleteProperty(property: Property) {
    const confirmed = window.confirm(
      `Permanently delete "${property.name}"? This action cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      setTrashActionId(property.id);
      const response = await fetch(
        `${API_URL}/properties/${property.id}/permanent`,
        { method: 'DELETE' },
      );
      if (!response.ok) throw new Error('Could not permanently delete property');

      setDeletedProperties((current) =>
        current.filter((item) => item.id !== property.id),
      );
    } catch (error) {
      console.error(error);
      window.alert('The property could not be permanently deleted.');
    } finally {
      setTrashActionId(null);
    }
  }

  async function retrySharePointFolder() {
    if (!selectedProperty || creatingSharePointFolder) return;

    try {
      setCreatingSharePointFolder(true);
      const response = await fetch(
        `${API_URL}/properties/${selectedProperty.id}/sharepoint-folder`,
        { method: 'POST' },
      );
      if (!response.ok) throw new Error('Could not create SharePoint folder');

      const updatedProperty = await response.json();
      setSelectedProperty(updatedProperty);
      setProperties((current) =>
        current.map((property) =>
          property.id === updatedProperty.id ? updatedProperty : property,
        ),
      );
    } catch (error) {
      console.error(error);
      window.alert(
        'The SharePoint folder could not be created. Check the connection and try again.',
      );
    } finally {
      setCreatingSharePointFolder(false);
    }
  }

  function openProposal() {
    if (!selectedProperty) return;
    setProposalTargetMargin(60);
    setManagementStatus('CURRENT');
    setAdjustments('0');
    setProposalNotes('');
    setProposalInternalName('');
    setProposalChemicalProjection(null);
    setProposalOverhead({ ...defaultProposalOverhead });
    setProposalServices([...proposalServiceOptions]);
    setProposalWaterBodies(
      selectedProperty.waterBodies.map((body) => {
        const type = body.type === 'POOL'
          ? 'SWIMMING_POOL'
          : body.type === 'FOUNTAIN'
            ? 'DECORATIVE_WATER_FEATURE'
            : body.type;
        return {
          id: body.id,
          name: body.name,
          gallons: body.gallons,
          type,
          include: body.active,
          category: body.size || '',
          monthlyPrice: type === 'SWIMMING_POOL'
            ? poolBasePrices[body.size ?? 'MEDIUM'] ?? 700
            : automaticWaterBodyPrices[type] ?? 150,
          frequency: '3x Weekly',
          disinfectionSystem: true,
          accessDifficulty: 'SIMPLE',
          priceManuallyAdjusted: false,
          priceMode: 'SUGGESTED',
        };
      }),
    );
    setShowProposal(true);
  }

  function updateProposalWaterBody(
    index: number,
    changes: Partial<ProposalWaterBody>,
  ) {
    setProposalWaterBodies((current) =>
      current.map((body, bodyIndex) => {
        if (bodyIndex !== index) return body;
        const updated = { ...body, ...changes };
        if (changes.type) {
          updated.category = changes.type === 'SWIMMING_POOL' ? 'SMALL' : '';
        }
        const pricingVariableChanged = [
          'type',
          'category',
          'frequency',
          'disinfectionSystem',
          'accessDifficulty',
        ].some((field) => field in changes);
        if (pricingVariableChanged) {
          return {
            ...updated,
            priceManuallyAdjusted: false,
            priceMode: 'SUGGESTED',
          };
        }
        return updated;
      }),
    );
  }

  function buildProposalEmailBody() {
    if (!selectedProperty) return '';
    const includedBodies = proposalWaterBodies.filter((body) => body.include);
    const primaryContact =
      selectedProperty.contacts.find((relation) => relation.isPrimary) ??
      selectedProperty.contacts[0];
    const formattedInvestment = monthlyInvestment.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    const serviceSubject =
      includedBodies.length === 1
        ? formatLabel(includedBodies[0].type).toLowerCase()
        : 'pools and water bodies';
    const propertyAddress = [
      selectedProperty.addressLine1,
      selectedProperty.city,
      selectedProperty.state,
      selectedProperty.zipCode,
    ]
      .filter(Boolean)
      .join(', ');
    return [
      `Proposal BL-${new Date().getFullYear()}-${propertySku(selectedProperty.id).toUpperCase()}`,
      `Prepared for: ${selectedProperty.name}`,
      `Address: ${propertyAddress}`,
      `Management company: ${selectedProperty.managementCompany?.name ?? '-'}`,
      `Contact: ${primaryContact?.contact.firstName ?? '-'} | ${primaryContact?.contact.phone ?? '-'} | ${primaryContact?.contact.email ?? '-'}`,
      '',
      `We are pleased to present Blue Life Pools’ proposal for the monthly maintenance of the ${serviceSubject} at ${selectedProperty.name}. Our commitment is to provide professional, efficient, and high-quality service, ensuring that your facilities remain in optimal condition throughout the year.`,
      '',
      'Our proposal includes:',
      ...proposalServices.map((service) => `✔ ${service}`),
      '',
      `The monthly service fee is ${formattedInvestment}. This fee reflects our commitment to quality, reliability, and the support of a specialized team.`,
      '',
      'Service details:',
      ...includedBodies.map(
        (body) =>
          `• ${body.name} | ${body.frequency}`,
      ),
      managementStatus === 'VIP'
        ? `• VIP pricing applied: fixed ${vipDiscountPercentage}% discount`
        : managementStatus === 'NEGOTIATED' && adjustmentPercentage > 0
          ? `• Negotiated pricing applied: fixed ${adjustmentPercentage}% discount`
        : '',
      proposalNotes.trim() ? `• Additional notes: ${proposalNotes.trim()}` : '',
      managementStatus === 'SURCHARGE' && proposalCalculatorSettings.surchargePercent > 0
        ? `• Negotiated surcharge applied: ${proposalCalculatorSettings.surchargePercent}%` : '',
      '',
      'Attached you will find the full details of our proposal for your review. Please do not hesitate to contact me with any questions or to discuss the next steps.',
      '',
      'We truly appreciate the opportunity to present this proposal and look forward to the possibility of working with you to maintain your facilities to the highest standards.',
      '',
      'Kind regards,',
      'Blue Life Pools',
    ].join('\n');
  }

  function buildProposalPdfData(): ProposalPdfData | null {
    if (!selectedProperty) return null;
    const includedBodies = proposalWaterBodies.filter((body) => body.include);
    const primaryContact =
      selectedProperty.contacts.find((relation) => relation.isPrimary) ??
      selectedProperty.contacts[0];
    const contactName = [
      primaryContact?.contact.firstName,
      primaryContact?.contact.lastName,
    ]
      .filter(Boolean)
      .join(' ');
    const propertyAddress = [
      selectedProperty.addressLine1,
      selectedProperty.city,
      selectedProperty.state,
      selectedProperty.zipCode,
    ]
      .filter(Boolean)
      .join(', ');

    return {
      proposalNumber: `BL-${new Date().getFullYear()}-${propertySku(selectedProperty.id).toUpperCase()}`,
      proposalDate: new Date(),
      clientName: selectedProperty.managementCompany?.name ?? '-',
      propertyName: selectedProperty.name,
      address: propertyAddress,
      contactName: contactName || '-',
      email: primaryContact?.contact.email ?? '-',
      phone: primaryContact?.contact.phone ?? '-',
      waterBodies: includedBodies.map((body) => ({
        description: body.name,
        type: [
          formatLabel(body.type),
          body.type === 'SWIMMING_POOL' && body.category
            ? formatLabel(body.category)
            : '',
        ]
          .filter(Boolean)
          .join(' - '),
        frequency: body.frequency,
        baseMonthlyCost: effectiveWaterBodyPrice(body),
      })),
      services: proposalServices,
      monthlyTransportationCost,
      discountPercentage: adjustmentPercentage,
      totalMonthlyInvestment: monthlyInvestment,
    };
  }

  async function createProposalEmailDraft(
    propertyId: string,
    activity: SalesActivity,
    recipientEmail: string,
    subject: string,
    body: string,
    pdfData?: ProposalPdfData,
  ) {
    const proposalData = pdfData ?? proposalPdfDataFromActivity(activity);
    if (!proposalData) {
      throw new Error('This proposal does not have enough saved data to generate its PDF.');
    }

    const pdfModule = await import('./proposalPdf');
    const pdf = await pdfModule.createProposalPdf(proposalData);
    const formData = new FormData();
    formData.append('recipientEmail', recipientEmail);
    formData.append('subject', subject);
    formData.append('body', body);
    formData.append('file', pdf.blob, pdf.fileName);

    const response = await fetch(
      `${API_URL}/properties/${propertyId}/sales-activities/${activity.id}/email-draft`,
      {
        method: 'POST',
        body: formData,
      },
    );
    if (!response.ok) {
      const result = await response.json().catch(() => null) as { message?: string } | null;
      throw new Error(result?.message ?? 'The Outlook draft could not be created.');
    }

    const updated: SalesActivity = await response.json();
    const replaceActivity = (property: Property) => ({
      ...property,
      salesActivities: property.salesActivities.map((item) =>
        item.id === updated.id ? updated : item,
      ),
    });
    setProperties((current) =>
      current.map((property) =>
        property.id === propertyId ? replaceActivity(property) : property,
      ),
    );
    setSelectedProperty((current) =>
      current?.id === propertyId ? replaceActivity(current) : current,
    );
    return updated;
  }

  async function storeProposalPdfInSharePoint(
    propertyId: string,
    activity: SalesActivity,
    pdf: { blob: Blob; fileName: string },
  ) {
    const formData = new FormData();
    formData.append('file', pdf.blob, pdf.fileName);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 60_000);
    let response: Response;
    try {
      response = await fetch(
        `${API_URL}/properties/${propertyId}/sales-activities/${activity.id}/pdf`,
        { method: 'POST', body: formData, signal: controller.signal },
      );
    } catch {
      throw new Error(controller.signal.aborted
        ? 'The server took too long to save the SharePoint copy. Try Create PDF again to retry.'
        : 'Could not connect to the server to save the SharePoint copy. Check your connection and try Create PDF again.');
    } finally {
      window.clearTimeout(timeout);
    }
    if (!response.ok) {
      const result = await response.json().catch(() => null) as { message?: string | string[] } | null;
      throw new Error(
        response.status === 413 ? 'The server rejected the SharePoint upload because the PDF is too large.'
          : response.status === 401 ? 'Your session expired. Sign in again to save the SharePoint copy.'
          : Array.isArray(result?.message) ? result.message.join(' ')
          : result?.message || 'The proposal PDF could not be saved to SharePoint. Try Create PDF again.',
      );
    }

    const updated: SalesActivity = await response.json();
    const replaceActivity = (property: Property) => ({
      ...property,
      salesActivities: property.salesActivities.map((item) =>
        item.id === updated.id ? updated : item,
      ),
    });
    setProperties((current) =>
      current.map((property) =>
        property.id === propertyId ? replaceActivity(property) : property,
      ),
    );
    setSelectedProperty((current) =>
      current?.id === propertyId ? replaceActivity(current) : current,
    );
    return updated;
  }

  async function downloadProposalPdf(activity: SalesActivity) {
    if (!selectedProperty) return;
    const proposalData = proposalPdfDataFromActivity(activity);
    if (!proposalData) {
      window.alert('This proposal does not have enough saved data to create its PDF.');
      return;
    }

    try {
      setProposalFileAction({ activityId: activity.id, action: 'CREATE' });
      const pdfModule = await import('./proposalPdf');
      const pdf = await pdfModule.createProposalPdf(proposalData);
      const downloadUrl = URL.createObjectURL(pdf.blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = pdf.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1_000);
      setLocallyCreatedProposalIds(current => current.includes(activity.id) ? current : [...current, activity.id]);
      setProposalFileAction({ activityId: activity.id, action: 'SAVE' });
      try {
        await storeProposalPdfInSharePoint(selectedProperty.id, activity, pdf);
      } catch (error) {
        console.error('The PDF was generated, but its SharePoint copy could not be saved.', error);
        window.alert(`The PDF was generated and its download started. ${error instanceof Error ? error.message : 'The SharePoint copy could not be saved.'}`);
      }
    } catch (error) {
      console.error(error);
      window.alert(
        error instanceof Error
          ? error.message
          : 'The proposal PDF could not be generated. Please try again.',
      );
    } finally {
      setProposalFileAction(null);
    }
  }

  async function saveProposal() {
    if (!selectedProperty || savingProposal) return;

    const includedBodies = proposalWaterBodies.filter((body) => body.include);
    if (includedBodies.length === 0) {
      window.alert('Include at least one water body in the proposal.');
      return;
    }
    if (proposalServices.length === 0) {
      window.alert('Select at least one service for the proposal.');
      return;
    }

    if (proposalCalculation.lines.some(line => line.costs !== null && line.costs.revenue <= 0)) {
      window.alert('Enter a positive monthly price for every included water body.');
      return;
    }
    const notes = buildProposalEmailBody();
    const pdfData = buildProposalPdfData();
    if (!pdfData) return;

    try {
      setSavingProposal(true);
      const proposalData = {
        ...pdfData,
        internalName: proposalInternalName.trim() || null,
        proposalDate: pdfData.proposalDate.toISOString(),
        allocations: proposalCalculation.allocations,
        pricingModel: {
          version: 3, basis: 'DOLLAR_CHEMICAL_FORECAST_WITH_PERCENTAGE_COSTS', targetMarginPercent: proposalTargetMargin,
          rates: { ...calculatorRates, ...proposalCalculation.rates }, chemicalRatesBySize, chemicalsIncluded: proposalCalculatorSettings.chemicalsIncluded,
          settings: proposalCalculatorSettings, history: proposalContext,
          chemicalProjectionSource: proposalChemicalProjection !== null ? 'MANUAL' : proposalContext?.chemicalHistory.averageMonthlyCost != null ? 'RECORDED_HISTORY' : 'SIZE_BUDGET',
          managementStatus, managementAdjustment: proposalCalculation.managementAdjustment,
          chemicalCost: proposalCalculation.chemicalCost, chemicalBudget: proposalCalculation.chemicalBudget,
          laborCost: proposalCalculation.laborCost, supplies: proposalCalculation.supplies,
          administration: proposalCalculation.administration, gasoline: proposalCalculation.estimatedGasoline,
          totalCost: proposalCalculation.totalCost, estimatedProfit: proposalCalculation.profit,
          estimatedMarginPercent: proposalCalculation.marginPercent, priceReference: proposalCalculation.priceReference,
          waterBodies: proposalCalculation.lines.filter(line => line.body.include).map(line => ({
            assumptions: line.body, commercialBase: line.base, monthlyPriceBeforeDiscount: line.grossPrice,
            chemicalRate: line.chemicalRate, costs: line.costs,
          })),
        },
      };
      const response = await fetch(
        `${API_URL}/properties/${selectedProperty.id}/sales-activities`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'PROPOSAL',
            notes,
            proposalData,
          }),
        },
      );
      if (!response.ok) throw new Error('Could not save proposal');
      const activity: SalesActivity = await response.json();
      setSelectedProperty((current) =>
        current?.id === selectedProperty.id
          ? {
              ...current,
              salesActivities: [activity, ...current.salesActivities],
            }
          : current,
      );
      setProperties((current) =>
        current.map((property) =>
          property.id === selectedProperty.id
            ? {
                ...property,
                salesActivities: [activity, ...property.salesActivities],
              }
            : property,
        ),
      );
      setPreviewActivityId(activity.id);
      setProposalDraftNotes(activity.notes ?? '');
      setShowProposal(false);
    } catch (error) {
      console.error(error);
      window.alert('The proposal could not be saved.');
    } finally {
      setSavingProposal(false);
    }
  }

  async function updateProposalStatusForProperty(
    propertyId: string,
    activityId: string,
    status: Exclude<SalesActivityStatus, 'CREATED'>,
  ) {
    try {
      const response = await fetch(
        `${API_URL}/properties/${propertyId}/sales-activities/${activityId}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        },
      );
      if (!response.ok) throw new Error('Could not update proposal status');

      const updated: SalesActivity = await response.json();
      if (activityId === focusedReminderActivityId && updated.status !== 'EXPIRED') {
        setFocusedReminderActivityId(null);
      }
      const replaceActivity = (property: Property) => ({
        ...property,
        salesActivities: property.salesActivities.map((activity) =>
          activity.id === updated.id ? updated : activity,
        ),
      });
      setSelectedProperty((current) =>
        current?.id === propertyId ? replaceActivity(current) : current,
      );
      setProperties((current) =>
        current.map((property) =>
          property.id === propertyId ? replaceActivity(property) : property,
        ),
      );
      return updated;
    } catch (error) {
      console.error(error);
      window.alert('The proposal status could not be updated.');
      return null;
    }
  }

  async function updateProposalStatus(
    activityId: string,
    status: Exclude<SalesActivityStatus, 'CREATED'>,
  ) {
    if (!selectedProperty) return null;
    return updateProposalStatusForProperty(selectedProperty.id, activityId, status);
  }

  async function recordProposalFollowUpForProperty(
    propertyId: string,
    activityId: string,
    notes: string,
    channel: 'EMAIL' | 'PHONE' | 'IN_PERSON' | 'OTHER',
  ) {
    try {
      const response = await fetch(
        `${API_URL}/properties/${propertyId}/sales-activities/${activityId}/follow-ups`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes, channel }),
        },
      );
      if (!response.ok) throw new Error('Could not record proposal follow-up');

      const updated: SalesActivity = await response.json();
      if (activityId === focusedReminderActivityId) {
        setFocusedReminderActivityId(null);
      }
      const replaceActivity = (property: Property) => ({
        ...property,
        salesActivities: property.salesActivities.map((activity) =>
          activity.id === updated.id ? updated : activity,
        ),
      });
      setSelectedProperty((current) =>
        current?.id === propertyId ? replaceActivity(current) : current,
      );
      setProperties((current) =>
        current.map((property) =>
          property.id === propertyId ? replaceActivity(property) : property,
        ),
      );
      return updated;
    } catch (error) {
      console.error(error);
      window.alert('The proposal follow-up could not be recorded.');
      return null;
    }
  }

  async function saveProposalInternalName(activityId: string, internalName: string) {
    if (!selectedProperty) return;
    const propertyId = selectedProperty.id;
    const response = await fetch(`${API_URL}/properties/${propertyId}/sales-activities/${activityId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ internalName }),
    });
    if (!response.ok) throw new Error('Could not save the internal proposal name. Please try again.');
    const updated = await response.json() as SalesActivity;
    const replaceActivity = (property: Property) => ({ ...property, salesActivities: property.salesActivities.map(item => item.id === updated.id ? updated : item) });
    setSelectedProperty(current => current?.id === propertyId ? replaceActivity(current) : current);
    setProperties(current => current.map(property => property.id === propertyId ? replaceActivity(property) : property));
  }

  async function saveProposalText(activityId: string, notes: string) {
    if (!selectedProperty) return null;
    setSavingProposalText(true);
    try {
      const response = await fetch(
        `${API_URL}/properties/${selectedProperty.id}/sales-activities/${activityId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes }),
        },
      );
      if (!response.ok) throw new Error('Could not save proposal text');
      const updated: SalesActivity = await response.json();
      const replaceActivity = (property: Property) => ({
        ...property,
        salesActivities: property.salesActivities.map((item) =>
          item.id === updated.id ? updated : item,
        ),
      });
      setSelectedProperty((current) => (current ? replaceActivity(current) : current));
      setProperties((current) =>
        current.map((property) =>
          property.id === selectedProperty.id ? replaceActivity(property) : property,
        ),
      );
      setProposalDraftNotes(updated.notes ?? '');
      return updated;
    } catch (error) {
      console.error(error);
      window.alert('The proposal text could not be saved.');
      return null;
    } finally {
      setSavingProposalText(false);
    }
  }

  useEffect(() => {
    if (!selectedProperty || !focusedReminderActivityId) return;

    window.requestAnimationFrame(() => {
      document.getElementById('sales-activity')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }, [selectedProperty, focusedReminderActivityId]);

  async function deleteProposal(activityId: string) {
    if (!selectedProperty) return;
    if (!window.confirm('Delete this proposal from Sales Activity?')) return;
    try {
      const response = await fetch(
        `${API_URL}/properties/${selectedProperty.id}/sales-activities/${activityId}`,
        { method: 'DELETE' },
      );
      if (!response.ok) throw new Error('Could not delete proposal');
      const remaining = selectedProperty.salesActivities.filter(
        (activity) => activity.id !== activityId,
      );
      setSelectedProperty({ ...selectedProperty, salesActivities: remaining });
      setProperties((current) =>
        current.map((property) =>
          property.id === selectedProperty.id
            ? { ...property, salesActivities: remaining }
            : property,
        ),
      );
      const nextActivity = remaining[0];
      setPreviewActivityId(nextActivity?.id ?? null);
      setProposalDraftNotes(nextActivity?.notes ?? '');
    } catch (error) {
      console.error(error);
      window.alert('The proposal could not be deleted.');
    }
  }

  async function saveProperty() {
    if (
      !selectedProperty ||
      !editForm
    ) {
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        `${API_URL}/properties/${selectedProperty.id}`,
        {
          method: 'PATCH',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            name:
              editForm.name.trim(),

            leadSource:
              editForm.leadSource ||
              undefined,

            propertyType:
              editForm.propertyType ||
              undefined,

            segment:
              editForm.segment ||
              undefined,

            serviceStartDate: editForm.serviceStartDate !== (selectedProperty.serviceStartDate?.slice(0, 10) ?? '')
              ? editForm.serviceStartDate || null
              : undefined,

            managementCompanyName:
              editForm.managementCompanyName.trim(),

            addressLine1:
              editForm.addressLine1 ||
              undefined,

            city:
              editForm.city ||
              undefined,

            county:
              editForm.county ||
              undefined,

            state:
              editForm.state ||
              undefined,

            zipCode:
              editForm.zipCode ||
              undefined,

            sharepointFolderUrl:
              editForm
                .sharepointFolderUrl ||
              undefined,

            maintenanceChiefInfo:
              editForm
                .maintenanceChiefInfo ||
              undefined,

            contacts: editContacts.map((contact) => ({
              contactId: contact.contactId,
              firstName: contact.firstName.trim() || undefined,
              lastName: contact.lastName.trim() || undefined,
              role: contact.role,
              email: contact.email.trim(),
              phone: contact.phone.trim() || undefined,
              isPrimary: contact.isPrimary,
            })),
            waterBodies: editWaterBodies.map((waterBody) => ({
              name: waterBody.name.trim(),
              technicianName: waterBody.technicianName.trim() || undefined,
              type: waterBody.type,
              size: waterBody.size || undefined,
              gallons: waterBody.gallons ? Number(waterBody.gallons) : undefined,
              active: true,
            })),

          }),
        },
      );

      if (!response.ok) {
        const error =
          await response.json();

        console.error(error);

        window.alert(
          'Could not save property changes.',
        );

        return;
      }

      const updatedProperty =
        await response.json();

      const refreshedResponse =
        await fetch(
          `${API_URL}/properties/${selectedProperty.id}`,
        );

      let completeProperty: Property =
        updatedProperty as Property;
      if (
        refreshedResponse.ok
      ) {
        completeProperty =
          await refreshedResponse.json();
      }

      let photoUploadFailures = 0;
      const usedWaterBodyIds = new Set<string>();
      for (const formWaterBody of editWaterBodies) {
        const files = formWaterBody.photoFiles ?? [];
        if (files.length === 0) continue;

        const updatedWaterBody = completeProperty.waterBodies.find(
          (candidate) =>
            candidate.name === formWaterBody.name.trim() &&
            !usedWaterBodyIds.has(candidate.id),
        );

        if (!updatedWaterBody) {
          photoUploadFailures += files.length;
          continue;
        }

        usedWaterBodyIds.add(updatedWaterBody.id);
        photoUploadFailures += await uploadWaterBodyPhotoFiles(
          completeProperty.id,
          updatedWaterBody.id,
          files,
        );
      }

      setSelectedProperty(
        completeProperty,
      );

      setProperties(
        properties.map(
          (property) =>
            property.id ===
            completeProperty.id
              ? completeProperty
              : property,
        ),
      );

      setIsEditing(false);
      setEditForm(null);
      setEditContacts([]);
      setEditWaterBodies([]);

      if (photoUploadFailures > 0) {
        window.alert(
          `Property saved, but ${photoUploadFailures} photo${photoUploadFailures === 1 ? '' : 's'} could not be uploaded. You can try again later.`,
        );
      }
    } catch (error) {
      console.error(error);

      window.alert(
        'Could not save property changes.',
      );
    } finally {
      setSaving(false);
    }
  }

  function navigateToArea(area: AppArea, options?: { healthUnassignedOnly?: boolean; reportsUnassignedOnly?: boolean }) {
    const isNathalia = appSession?.user.name?.toLowerCase().includes('nathalia') || appSession?.user.email?.toLowerCase().includes('nathalia');
    if (isNathalia && !['home', 'reports', 'quality'].includes(area)) area = 'home';
    if (!sharedChemicalAccess && area !== 'home') {
      const role = appSession?.user.role;
      const assignedArea = role?.toLowerCase();
      const sharedAreas: AppArea[] = role === 'QUALITY'
        ? ['home', 'quality']
        : role === 'REPORTS'
          ? ['home', 'reports', 'complaints', 'quality']
          : isNathalia
            ? ['home', 'quality']
            : ['home', 'complaints', 'quality'];
      if (!['SUPER_ADMIN', 'OPERATIONS_DIRECTOR'].includes(role || '') && !sharedAreas.includes(area) && area !== assignedArea && !(role === 'COMMERCIAL' && area === 'opportunities')) area = 'home';
    }
    setActiveArea(area);
    setHealthUnassignedOnly(area === 'health' && Boolean(options?.healthUnassignedOnly));
    setReportsUnassignedOnly(area === 'reports' && Boolean(options?.reportsUnassignedOnly));
    setSelectedProperty(null);
    setShowDeleted(false);
  }

  function renderAppSidebar() {
    if (sharedChemicalAccess) return null;
    const allAreas: Array<{ id: AppArea; label: string }> = [
      { id: 'home', label: 'Home' },
      { id: 'commercial', label: 'Commercial' },
      { id: 'opportunities', label: 'Opportunities' },
      { id: 'chemicals', label: 'Chemicals' },
      { id: 'health', label: 'Health Dept.' },
      { id: 'reports', label: 'Reports' },
      { id: 'complaints', label: 'Calls' },
      { id: 'quality', label: 'Quality' },
    ];
    const role = appSession?.user.role;
    const assignedArea = role?.toLowerCase();
    const isNathalia = appSession?.user.name?.toLowerCase().includes('nathalia') || appSession?.user.email?.toLowerCase().includes('nathalia');
    const areas = ['SUPER_ADMIN', 'OPERATIONS_DIRECTOR'].includes(role || '')
      ? allAreas
      : role === 'QUALITY'
        ? allAreas.filter((area) => area.id === 'home' || area.id === 'quality')
      : role === 'REPORTS'
        ? allAreas.filter((area) => area.id === 'home' || area.id === 'reports' || area.id === 'quality' || (!isNathalia && area.id === 'complaints'))
      : allAreas.filter((area) => isNathalia
        ? area.id === 'home' || area.id === 'reports' || area.id === 'quality'
        : area.id === 'home' || area.id === 'complaints' || area.id === 'quality' || area.id === assignedArea || role === 'COMMERCIAL' && area.id === 'opportunities');

    return (<>
      <aside className={`app-sidebar workspace-sidebar${sidebarCollapsed ? ' app-sidebar-collapsed' : ''}`} data-area-count={areas.length} aria-label="BlueLife areas">
        <button className="sidebar-collapse-button" type="button" onClick={() => setSidebarCollapsed(true)} aria-label="Hide navigation and use full screen" title="Hide navigation">‹</button>
        <div className="sidebar-brand">
          <img className="sidebar-logo" src="/blue-life-logo.png" alt="Blue Life Pool Service" decoding="async" />
          <div><strong>BlueLife</strong><small>Internal App</small></div>
        </div>
        <p className="workspace-sidebar-caption">WORKSPACE</p>
        <div className="mobile-sidebar-session">
          <div><strong>{appSession?.user.name}</strong><small>{appSession?.user.role.toLowerCase()}</small></div>
          <button type="button" onClick={() => void logoutApp()}>Log out</button>
        </div>
        <nav>
          {areas.map((area) => (
            <button
              type="button"
              data-area={area.id}
              className={activeArea === area.id ? 'sidebar-active' : ''}
              key={area.id}
              onClick={() => navigateToArea(area.id)}
            >
              <span aria-hidden="true"><WorkspaceIcon name={area.id === 'commercial' ? 'chart' : area.id} /></span>
              {area.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <img className="sidebar-logo" src="/blue-life-logo.png" alt="" aria-hidden="true" decoding="async" />
          <div className="sidebar-account"><strong>{appSession?.user.name}</strong><small>{appSession?.user.role.toLowerCase()}</small></div>
          <button className="sidebar-logout" type="button" onClick={() => void logoutApp()}>Log out</button>
        </div>
      </aside>
      {sidebarCollapsed && <button className="sidebar-expand-button workspace-sidebar-toggle" type="button" onClick={() => setSidebarCollapsed(false)} aria-label="Show navigation" title="Show navigation">›</button>}
    </>);
  }

  async function logoutApp() {
    await fetch(`${API_URL}/auth/logout`, { method: 'POST' }).catch(() => undefined);
    setAppToken('');
    setAppSession(null);
    setActiveArea('home');
    setProperties([]);
    setDeletedProperties([]);
  }

  function renderProposalReminderCenter() {
    const totalReminderCount = proposalReminders.length;

    return (
      <div className="proposal-reminder-center">
        <button
          className="proposal-reminder-button"
          type="button"
          aria-label={`${totalReminderCount} proposal follow-up reminders`}
          aria-expanded={showProposalReminders}
          onClick={() => setShowProposalReminders((current) => !current)}
        >
          <span aria-hidden="true"><WorkspaceIcon name="bell" /></span>
          {totalReminderCount > 0 && (
            <strong>{totalReminderCount > 99 ? '99+' : totalReminderCount}</strong>
          )}
        </button>

        {showProposalReminders && (
          <aside className="proposal-reminder-panel" aria-label="Proposal follow-up reminders">
            <div className="proposal-reminder-header">
              <div>
                <h2>Proposal follow-ups</h2>
                <p>Overdue proposals and proposals marked expired.</p>
              </div>
              <button
                type="button"
                aria-label="Close reminders"
                onClick={() => setShowProposalReminders(false)}
              >
                &times;
              </button>
            </div>

            {totalReminderCount === 0 ? (
              <div className="proposal-reminder-empty">
                <span aria-hidden="true">&#10003;</span>
                <strong>You're up to date</strong>
                <p>There are no overdue proposal follow-ups.</p>
              </div>
            ) : (
              <div className="proposal-reminder-list">
                {proposalReminders.map(({ activity, property, contact }) => {
                  const sentDate = new Date(activity.sentAt ?? activity.occurredAt);
                  const daysWaiting = Math.floor((reminderReferenceTime - sentDate.getTime()) / (24 * 60 * 60 * 1000));
                  const email = contact?.contact.email;
                  const contactName = [contact?.contact.firstName, contact?.contact.lastName]
                    .filter(Boolean)
                    .join(' ');
                  const isExpired = activity.status === 'EXPIRED';
                  const reminderLabel = isExpired
                    ? 'Expired - awaiting action'
                    : `${daysWaiting} days without response`;

                  return (
                    <article className="proposal-reminder-item" key={activity.id}>
                      <button
                        className="proposal-reminder-property"
                        type="button"
                        onClick={() => {
                          setShowProposalReminders(false);
                          void openProperty(property.id, activity.id);
                        }}
                      >
                        <span>{reminderLabel}</span>
                        <strong>{property.name}</strong>
                        <small>
                          {contactName || 'Primary contact'} · {isExpired ? 'Expired' : 'Sent'} {sentDate.toLocaleDateString('en-US')}
                        </small>
                        <small>
                          {activity.followUps?.length ?? 0} follow-up{(activity.followUps?.length ?? 0) === 1 ? '' : 's'} recorded
                        </small>
                      </button>
                      <div className="proposal-reminder-actions">
                        {email ? (
                          <button
                            className="proposal-reminder-action proposal-reminder-action-primary"
                            type="button"
                            onClick={async () => {
                              try {
                                const body = activity.notes ?? '';
                                const updated = await createProposalEmailDraft(
                                  property.id,
                                  activity,
                                  email,
                                  `Blue Life Pools Proposal - ${property.name}`,
                                  body,
                                );
                                await recordProposalFollowUpForProperty(
                                  property.id,
                                  activity.id,
                                  'Proposal follow-up email draft created.',
                                  'EMAIL',
                                );
                                setShowProposalReminders(false);
                                if (updated.emailDraftWebUrl) {
                                  window.location.href = updated.emailDraftWebUrl;
                                }
                              } catch (error) {
                                console.error(error);
                                window.alert(
                                  error instanceof Error
                                    ? error.message
                                    : 'The follow-up draft could not be created.',
                                );
                              }
                            }}
                          >
                            Create follow-up draft
                          </button>
                        ) : (
                          <span className="proposal-reminder-no-email">No email</span>
                        )}
                        {!isExpired && (
                          <button
                            className="proposal-reminder-action proposal-reminder-action-secondary"
                            type="button"
                            onClick={() => {
                              void updateProposalStatusForProperty(property.id, activity.id, 'EXPIRED');
                            }}
                          >
                            Mark expired
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            <p className="proposal-reminder-note">
              A reminder disappears after resending, approval, or rejection. Expired proposals stay here until managed.
            </p>
          </aside>
        )}
      </div>
    );
  }

  if (!sharedChemicalAccess && authLoading) {
    return <div className="page"><p>Checking session...</p></div>;
  }

  if (!sharedChemicalAccess && !appSession) {
    return <LoginPage onLogin={(session) => { setAppSession(session); setActiveArea('home'); setLoading(true); }} />;
  }

  if (activeArea === 'health') return <HealthDepartmentPage sidebar={renderAppSidebar()} properties={properties.map((property) => ({ id: property.id, name: property.name }))} unassignedOnly={healthUnassignedOnly} onClearUnassignedFilter={() => setHealthUnassignedOnly(false)} />;
  if (activeArea === 'reports') return <ReportsPage sidebar={renderAppSidebar()} properties={properties.map((property) => ({ id: property.id, name: property.name }))} unassignedOnly={reportsUnassignedOnly} onClearUnassignedFilter={() => setReportsUnassignedOnly(false)} />;
  if (activeArea === 'chemicals') {
    return <ChemicalsPage sidebar={renderAppSidebar()} />;
  }
  if (activeArea === 'complaints') return <ComplaintsPage sidebar={renderAppSidebar()} properties={properties.map((property) => ({ id: property.id, name: property.name }))} />;
  if (activeArea === 'quality') return <QualityInspectionsPage sidebar={renderAppSidebar()} properties={properties.map((property) => ({ id: property.id, name: property.name, waterBodies: property.waterBodies }))} isSuperAdmin={appSession?.user.role === 'SUPER_ADMIN' || appSession?.user.role === 'OPERATIONS_DIRECTOR'} />;
  if (activeArea === 'opportunities') return <OpportunitiesPage sidebar={renderAppSidebar()} properties={properties.map((property) => ({ id: property.id, name: property.name }))} canDelete={appSession?.user.role === 'SUPER_ADMIN' || appSession?.user.role === 'OPERATIONS_DIRECTOR'} />;
  if (activeArea === 'home') return <PropertyHistoryPage sidebar={renderAppSidebar()} properties={properties} canEdit={appSession?.user.role === 'COMMERCIAL' || appSession?.user.role === 'OPERATIONS_DIRECTOR' || appSession?.user.role === 'SUPER_ADMIN'} onOpenHealth={appSession?.user.role === 'HEALTH' || appSession?.user.role === 'OPERATIONS_DIRECTOR' || appSession?.user.role === 'SUPER_ADMIN' ? () => navigateToArea('health', { healthUnassignedOnly: true }) : undefined} onOpenReports={appSession?.user.role === 'QUALITY' ? undefined : () => navigateToArea('reports', { reportsUnassignedOnly: true })} onNewProperty={() => openCreateForm('home')} onPropertyUpdated={(updatedProperty) => setProperties((current) => current.map((property) => property.id === updatedProperty.id ? { ...property, ...updatedProperty } : property))} />;
  if (
    selectedProperty
  ) {
    if (showProposal) return <ProposalCalculator
      sidebar={renderAppSidebar()} headerActions={renderProposalReminderCenter()} property={selectedProperty}
      calculation={proposalCalculation} settings={proposalCalculatorSettings} context={proposalContext}
      historyLoading={proposalHistoryLoading} historyError={proposalHistoryError}
      managementStatus={managementStatus} adjustment={adjustments} services={proposalServices} notes={proposalNotes} internalName={proposalInternalName} saving={savingProposal}
      onUpdate={updateProposalWaterBody} onTarget={setProposalTargetMargin} onChemicals={setProposalChemicalProjection}
      onOverhead={(field, value) => setProposalOverhead(current => ({ ...current, [field]: value }))}
      onInternalName={setProposalInternalName}
      onManagement={status => { setManagementStatus(status); setAdjustments(status === 'VIP' ? '20' : '0'); }}
      onAdjustment={setAdjustments} onServices={setProposalServices} onNotes={setProposalNotes}
      onClose={() => setShowProposal(false)} onReset={openProposal} onSave={() => void saveProposal()}
      onRetryHistory={() => setProposalHistoryRefresh(value => value + 1)}
    />;
    const approvedProposals = selectedProperty.salesActivities.filter((activity) => activity.status === 'APPROVED').length;
    const isClient = selectedProperty.lifecycleStatus === 'CLIENT';
    const serviceStartLabel = selectedProperty.serviceStartDate ? new Date(selectedProperty.serviceStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—';
    const journey = [
      { label: 'Property Created', complete: true, date: selectedProperty.createdAt ? new Date(selectedProperty.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null },
      { label: 'Proposal', complete: isClient || selectedProperty.salesActivities.length > 0, date: null },
      { label: 'Contract', complete: isClient || approvedProposals > 0, date: null },
      { label: 'Service Start', complete: isClient, date: selectedProperty.serviceStartDate ? serviceStartLabel : null },
    ];
    const currentStage = journey.findIndex((stage) => !stage.complete);
    return (
      <div className="page app-page property-workspace">
        {renderAppSidebar()}
        <div className="property-detail-nav">
        <button
          className="back-button"
          onClick={() => {
            setSelectedProperty(
              null,
            );

            setIsEditing(false);
            setEditForm(null);
          }}
        >
          <WorkspaceIcon name="arrow-left" />Properties
        </button>
          {renderProposalReminderCenter()}
        </div>

        <header className="property-header">
          <div className="property-heading-identity"><span className="property-heading-icon"><WorkspaceIcon name="pool" /></span><div>
            <h1>{selectedProperty.name}</h1>
            <p><WorkspaceIcon name="pin" />{[selectedProperty.city, selectedProperty.state].filter(Boolean).join(', ') || 'Location not assigned'}</p>
          </div></div>
          <div className="property-header-actions">
            <div className="property-lifecycle-summary">
              <span className={`lifecycle-badge lifecycle-${selectedProperty.lifecycleStatus === 'INACTIVE' ? 'inactive' : isClient ? 'client' : 'lead'}`}>{selectedProperty.lifecycleStatus === 'INACTIVE' ? 'Inactive' : isClient ? 'Client' : 'Lead'}</span>
              {selectedProperty.serviceStartDate && <small className="property-service-since"><WorkspaceIcon name="calendar" />Service since {serviceStartLabel}</small>}
            </div>
            {!isEditing && <details className="property-more-menu"><summary aria-label="Property actions"><WorkspaceIcon name="more" /></summary><div><button className="danger-button" onClick={moveSelectedPropertyToTrash} disabled={saving}><WorkspaceIcon name="trash" />Delete Property</button></div></details>}
          </div>
        </header>

        <nav className="property-tabs" aria-label="Property workspace">
          {([
            ['overview', 'Overview'], ['commercial', 'Commercial'], ['estimates', 'Estimates'], ['contracts', 'Contracts'], ['quality', 'Quality'],
          ] as Array<[PropertyTab, string]>).map(([tab, label]) => <button type="button" className={propertyTab === tab ? 'property-tab-active' : ''} key={tab} aria-pressed={propertyTab === tab} onClick={() => setPropertyTab(tab)}><WorkspaceIcon name={({ overview: 'home', commercial: 'commercial', estimates: 'reports', contracts: 'contract', quality: 'quality' } as const)[tab]} />{label}</button>)}
        </nav>

        {propertyTab === 'overview' && <section className="property-command-center" aria-label="Property journey">
          <div className="property-command-heading"><h2><WorkspaceIcon name="layers" />Property Journey</h2></div>
          <div className="property-processes"><div className="process-track">{journey.map((stage, index) => <span className={stage.complete ? 'process-complete' : index === currentStage ? 'process-current' : ''} aria-current={index === currentStage ? 'step' : undefined} key={stage.label}>{stage.complete && <WorkspaceIcon name="check" />}{stage.label}{stage.date && <small>{stage.date}</small>}</span>)}</div></div>
        </section>}

        {(propertyTab === 'overview' || propertyTab === 'commercial') && (propertyTab === 'overview' && isEditing &&
        editForm ? (
          <section className="edit-panel property-overview-card">
            <div className="edit-panel-header">
              <div>
                <h2>
                  Property information
                </h2>

                <p>
                  Edit the general details in one place.
                </p>
              </div>

              <div className="edit-actions">
                <button
                  className="secondary-button"
                  onClick={
                    cancelEditing
                  }
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  className="primary-button"
                  onClick={
                    saveProperty
                  }
                  disabled={
                    saving ||
                    !editContactsAreValid ||
                    !editWaterBodiesAreValid
                  }
                >
                  {saving
                    ? 'Saving...'
                    : 'Save Changes'}
                </button>
              </div>
            </div>

            <div className="form-grid">
              <div className="form-field form-field-wide">
                <label>
                  Property Name
                </label>

                <input
                  value={
                    editForm.name
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      'name',
                      event.target
                        .value,
                    )
                  }
                />
              </div>

              <div className="form-field">
                <label>
                  Property Type
                </label>

                <select
                  value={
                    editForm.propertyType
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      'propertyType',
                      event.target
                        .value,
                    )
                  }
                >
                  <option value="">
                    Select type
                  </option>

                  <option value="COMMERCIAL">
                    Commercial
                  </option>

                  <option value="RESIDENTIAL">
                    Residential
                  </option>
                </select>
              </div>

              <div className="form-field">
                <label>
                  Segment
                </label>

                <select
                  value={
                    editForm.segment
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      'segment',
                      event.target
                        .value,
                    )
                  }
                >
                  <option value="">
                    Select segment
                  </option>

                  <option value="MULTIFAMILY">
                    Multifamily
                  </option>

                  <option value="HOA">
                    HOA
                  </option>

                  <option value="HOTEL">
                    Hotel
                  </option>

                  <option value="SINGLE_FAMILY">
                    Single Family
                  </option>
                </select>
              </div>

              <div className="form-field">
                <label>
                  Management Company
                </label>

                <input
                  value={editForm.managementCompanyName}
                  onChange={(event) =>
                    updateField(
                      'managementCompanyName',
                      event.target.value,
                    )
                  }
                  placeholder="Example: ABC Property Management"
                />
              </div>

              <div className="form-field">
                <label htmlFor="property-service-start-date">Service Start</label>
                <input id="property-service-start-date" aria-label="Service start date" type="date" value={editForm.serviceStartDate} disabled={saving} onChange={event => updateField('serviceStartDate', event.target.value)} />
              </div>

              <div className="form-field">
                <label>
                  Lead Source
                </label>

                <select
                  value={
                    editForm.leadSource
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      'leadSource',
                      event.target
                        .value,
                    )
                  }
                >
                  <option value="">
                    Select source
                  </option>

                  <option value="ROUTE">
                    Route
                  </option>

                  <option value="REFERRAL">
                    Referral
                  </option>
                </select>
              </div>

              <div className="form-field form-field-wide">
                <label>
                  Address
                </label>

                <input
                  value={
                    editForm.addressLine1
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      'addressLine1',
                      event.target
                        .value,
                    )
                  }
                />
              </div>

              <div className="form-field">
                <label>
                  City
                </label>

                <input
                  value={
                    editForm.city
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      'city',
                      event.target
                        .value,
                    )
                  }
                />
              </div>

              <div className="form-field">
                <label>
                  County
                </label>

                <input
                  value={
                    editForm.county
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      'county',
                      event.target
                        .value,
                    )
                  }
                />
              </div>

              <div className="form-field">
                <label>
                  State
                </label>

                <input
                  value={
                    editForm.state
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      'state',
                      event.target
                        .value,
                    )
                  }
                />
              </div>

              <div className="form-field">
                <label>
                  ZIP Code
                </label>

                <input
                  value={
                    editForm.zipCode
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      'zipCode',
                      event.target
                        .value,
                    )
                  }
                />
              </div>

              <div className="form-field form-field-wide">
                <label>
                  SharePoint Folder URL
                </label>

                <input
                  value={
                    editForm.sharepointFolderUrl
                  }
                  onChange={(
                    event,
                  ) =>
                    updateField(
                      'sharepointFolderUrl',
                      event.target
                        .value,
                    )
                  }
                />
              </div>

              <div className="form-section-title form-field-wide">
                <div>
                  <h3>Contacts</h3>
                  <p>Edit existing contacts or add a new one.</p>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={addEditContact}
                >
                  + Add contact
                </button>
              </div>

              <div className="contacts-editor form-field-wide">
                {editContacts.map((contact, index) => (
                  <div
                    className="contact-editor"
                    key={contact.contactId ?? `new-${index}`}
                  >
                    <div className="contact-editor-header">
                      <strong>Contact {index + 1}</strong>
                      {editContacts.length > 1 && (
                        <button
                          className="delete-button"
                          type="button"
                          onClick={() => removeEditContact(index)}
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="form-grid contact-fields">
                      <div className="form-field">
                        <label>Role *</label>
                        <select
                          value={contact.role}
                          onChange={(event) =>
                            updateEditContact(index, 'role', event.target.value)
                          }
                        >
                          <option value="">Select role</option>
                          <option value="PROPERTY_MANAGER">Property Manager</option>
                          <option value="REGIONAL_MANAGER">Regional Manager</option>
                          <option value="MAINTENANCE_CHIEF">Maintenance Chief</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </div>

                      <div className="form-field">
                        <label>Email *</label>
                        <input
                          type="email"
                          value={contact.email}
                          onChange={(event) =>
                            updateEditContact(index, 'email', event.target.value)
                          }
                        />
                      </div>

                      <div className="form-field">
                        <label>First Name (optional)</label>
                        <input
                          value={contact.firstName}
                          onChange={(event) =>
                            updateEditContact(index, 'firstName', event.target.value)
                          }
                        />
                      </div>

                      <div className="form-field">
                        <label>Last Name (optional)</label>
                        <input
                          value={contact.lastName}
                          onChange={(event) =>
                            updateEditContact(index, 'lastName', event.target.value)
                          }
                        />
                      </div>

                      <div className="form-field">
                        <label>Phone (optional)</label>
                        <input
                          type="tel"
                          value={contact.phone}
                          onChange={(event) =>
                            updateEditContact(index, 'phone', event.target.value)
                          }
                        />
                      </div>

                      <label className="primary-contact-check">
                        <input
                          type="checkbox"
                          checked={contact.isPrimary}
                          onChange={() =>
                            updateEditContact(index, 'isPrimary', true)
                          }
                        />
                        Primary contact
                      </label>
                    </div>
                  </div>
                ))}

                {!editContacts.some(
                  (contact) => contact.role === 'PROPERTY_MANAGER',
                ) && (
                  <span className="field-error">
                    Add at least one Property Manager.
                  </span>
                )}
                {new Set(editContactEmails).size !==
                  editContactEmails.length && (
                  <span className="field-error">
                    Contact email addresses cannot be repeated.
                  </span>
                )}
              </div>

              <WaterBodiesEditor
                bodies={editWaterBodies}
                idPrefix="edit-water-body"
                onAdd={() => addWaterBody('edit')}
                onUpdate={(index, field, value) =>
                  updateWaterBody('edit', index, field, value)
                }
                onRemove={(index) => removeWaterBody('edit', index)}
                onFilesSelected={(index, files) =>
                  selectWaterBodyPhotos('edit', index, files)
                }
              />

            </div>
          </section>
        ) : (
          <div className="property-grid">
            {propertyTab === 'overview' && <CommercialPropertyOverview property={selectedProperty} serviceStart={serviceStartLabel} formatLabel={formatLabel} onEdit={startEditing} onRetrySharePoint={() => void retrySharePointFolder()} creatingSharePoint={creatingSharePointFolder} />}

            <section
              id="sales-activity"
              className={`detail-card detail-card-wide ${propertyTab !== 'commercial' ? 'tab-panel-hidden' : ''} ${focusedReminderActivityId ? 'sales-activity-follow-up' : ''}`}
            >
              <div className="card-header">
                <h2>Sales Activity</h2>
                <button
                  className="primary-button"
                  onClick={openProposal}
                >
                  Generate Proposal
                </button>
              </div>

              {focusedReminderActivityId && (() => {
                const reminderActivity = selectedProperty.salesActivities.find(
                  (activity) => activity.id === focusedReminderActivityId,
                );
                if (!reminderActivity) return null;
                const isExpiredFollowUp = reminderActivity.status === 'EXPIRED';
                const followUpSentAt = reminderActivity.sentAt
                  ? new Date(reminderActivity.sentAt)
                  : new Date(reminderActivity.occurredAt);
                const daysWaiting = Math.floor(
                  (reminderReferenceTime - followUpSentAt.getTime()) /
                  (24 * 60 * 60 * 1000),
                );

                return (
                  <div className="sales-follow-up-banner">
                    <div>
                      <strong>{isExpiredFollowUp ? 'This proposal is marked expired' : 'This proposal needs follow-up'}</strong>
                      <span>
                        {isExpiredFollowUp
                          ? `Marked expired ${followUpSentAt.toLocaleDateString('en-US')} · ${daysWaiting} days since sent`
                          : `Sent ${followUpSentAt.toLocaleDateString('en-US')} · ${daysWaiting} days without a recorded response`}
                      </span>
                    </div>
                    <button type="button" onClick={() => setFocusedReminderActivityId(null)}>
                      Dismiss
                    </button>
                  </div>
                );
              })()}

              {selectedProperty
                .salesActivities
                .length === 0 ? (
                <p className="empty-text">
                  No sales activity
                  registered.
                </p>
              ) : (
                <div className="sales-activity-workspace">
                  <div className="proposal-board" aria-label="Proposal status board">
                    {proposalBoardStatuses.map((status) => {
                      const activities = selectedProperty.salesActivities.filter(
                        (activity) => (activity.status ?? 'CREATED') === status,
                      );

                      return (
                        <section className="proposal-board-column" key={status}>
                          <div className="proposal-board-heading">
                            <span className={`proposal-board-dot status-${status.toLowerCase()}`} />
                            <h3>{proposalStatusLabel(status)}</h3>
                            <strong>{activities.length}</strong>
                          </div>
                          <div className="proposal-board-cards">
                            {activities.length === 0 && (
                              <p className="proposal-board-empty">No proposals</p>
                            )}
                    {activities.map(
                      (activity) => (
                        <button
                          type="button"
                          className={`proposal-board-card ${
                            (previewActivityId ?? selectedProperty.salesActivities[0]?.id) === activity.id
                              ? 'activity-selected'
                              : ''
                          } ${focusedReminderActivityId === activity.id ? 'proposal-follow-up-card' : ''}`}
                          key={
                            activity.id
                          }
                          onClick={() => {
                            setPreviewActivityId(activity.id);
                            setProposalDraftNotes(activity.notes ?? '');
                            if (focusedReminderActivityId !== activity.id) {
                              setFocusedReminderActivityId(null);
                            }
                          }}
                        >
                          <span>{formatLabel(activity.type)}</span>
                          <strong>{activity.proposalData?.internalName || selectedProperty.name}</strong>
                          {activity.proposalData?.internalName && <span className="proposal-board-property-name">{selectedProperty.name}</span>}

                          <small>
                            Created {new Date(activity.occurredAt).toLocaleDateString('en-US')}
                            {activity.sentAt
                              ? ` · Sent ${new Date(activity.sentAt).toLocaleDateString('en-US')}`
                              : ''}
                            {activity.approvedAt
                              ? ` · Approved ${new Date(activity.approvedAt).toLocaleDateString('en-US')}`
                              : ''}
                            {activity.rejectedAt
                              ? ` · Rejected ${new Date(activity.rejectedAt).toLocaleDateString('en-US')}`
                              : ''}
                            {activity.followUps?.length
                              ? ` · ${activity.followUps.length} follow-up${activity.followUps.length === 1 ? '' : 's'}`
                              : ''}
                          </small>
                        </button>
                      ),
                    )}
                          </div>
                        </section>
                      );
                    })}
                  </div>

                  {(() => {
                    const activity =
                      selectedProperty.salesActivities.find(
                        (item) => item.id === previewActivityId,
                      ) ?? selectedProperty.salesActivities[0];
                    const primaryContact =
                      selectedProperty.contacts.find((contact) => contact.isPrimary) ??
                      selectedProperty.contacts[0];
                    if (!activity) return null;
                    const activeFileAction =
                      proposalFileAction?.activityId === activity.id
                        ? proposalFileAction.action
                        : null;
                    return (
                      <aside className="sales-email-preview" aria-label="Proposal email preview">
                        <div className="email-preview-header">
                          <span>Email preview</span>
                          <strong>Blue Life Pools</strong>
                        </div>
                        <ProposalInternalNameEditor key={activity.id} name={activity.proposalData?.internalName} disabled={Boolean(proposalFileAction)} onSave={name => saveProposalInternalName(activity.id, name)} />
                        <div className="email-preview-meta">
                          <span><b>To:</b> {primaryContact?.contact.email ?? 'No primary contact email'}</span>
                          <span><b>Subject:</b> Blue Life Pools Proposal - {selectedProperty.name}</span>
                          <span><b>Created:</b> {new Date(activity.occurredAt).toLocaleString('en-US')}</span>
                          <span><b>Sent:</b> {activity.sentAt ? new Date(activity.sentAt).toLocaleString('en-US') : 'Not sent yet'}</span>
                          <span><b>Approved:</b> {activity.approvedAt ? new Date(activity.approvedAt).toLocaleString('en-US') : 'Not approved yet'}</span>
                          <span><b>Rejected:</b> {activity.rejectedAt ? new Date(activity.rejectedAt).toLocaleString('en-US') : 'Not rejected yet'}</span>
                          <span className={`proposal-status status-${(activity.status ?? 'CREATED').toLowerCase()}`}>
                            {proposalStatusLabel(activity.status ?? 'CREATED')}
                          </span>
                          <span>
                            <b>PDF:</b>{' '}
                            {activity.proposalPdfSharepointUrl ? (
                              <a
                                href={activity.proposalPdfSharepointUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open in SharePoint
                              </a>
                            ) : (
                              locallyCreatedProposalIds.includes(activity.id)
                                ? 'Created locally; not saved to SharePoint yet'
                                : 'Not saved to SharePoint yet'
                            )}
                          </span>
                          <span><b>Follow-ups:</b> {activity.followUps?.length ?? 0}</span>
                        </div>
                        <div className="email-preview-body-layout">
                          <textarea
                            className="email-preview-editor"
                            aria-label="Editable proposal email text"
                            disabled={activity.status === 'APPROVED' || activity.status === 'REJECTED'}
                            value={
                              (previewActivityId === activity.id
                                ? proposalDraftNotes
                                : activity.notes) ?? ''
                            }
                            onChange={(event) => setProposalDraftNotes(event.target.value)}
                            onBlur={() => {
                              const notes = previewActivityId === activity.id
                                ? proposalDraftNotes
                                : activity.notes ?? '';
                              if (notes !== (activity.notes ?? '')) {
                                void saveProposalText(activity.id, notes);
                              }
                            }}
                          />
                            <aside
                              className="proposal-follow-up-drawer"
                              id={`proposal-follow-ups-${activity.id}`}
                              aria-label="Proposal follow-up history"
                            >
                              <div className="proposal-follow-up-drawer-header">
                                <div>
                                  <span>Follow-ups</span>
                                  <strong>{activity.followUps?.length ?? 0}</strong>
                                </div>
                              </div>
                              <button
                              className="proposal-follow-up-log-button"
                              type="button"
                              onClick={async () => {
                                const note = window.prompt(
                                  'What happened during this follow-up?',
                                  '',
                                );
                                if (note === null) return;
                                await recordProposalFollowUpForProperty(
                                  selectedProperty.id,
                                  activity.id,
                                  note,
                                  'OTHER',
                                );
                              }}
                            >
                              + Log follow-up
                            </button>
                          {(activity.followUps?.length ?? 0) > 0 ? (
                            <ul className="proposal-follow-up-drawer-list">
                              {activity.followUps?.map((followUp) => (
                                <li key={followUp.id}>
                                  <span>
                                    {new Date(followUp.occurredAt).toLocaleDateString('en-US')}
                                    {' · '}
                                    {formatLabel(followUp.channel)}
                                  </span>
                                  {followUp.notes && <small>{followUp.notes}</small>}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="proposal-follow-up-drawer-empty">
                              No follow-ups recorded yet.
                            </p>
                          )}
                            </aside>
                        </div>
                        <div className="email-preview-actions">
                          <button
                            className="secondary-button"
                            type="button"
                            disabled={Boolean(proposalFileAction)}
                            onClick={() => void downloadProposalPdf(activity)}
                          >
                            {activeFileAction === 'CREATE' ? 'Creating PDF...' : activeFileAction === 'SAVE' ? 'Saving PDF...' : 'Create PDF'}
                          </button>
                          <button
                            className="primary-button"
                            type="button"
                            disabled={
                              Boolean(proposalFileAction) ||
                              !primaryContact?.contact.email ||
                              !(previewActivityId === activity.id ? proposalDraftNotes : activity.notes) ||
                              activity.status === 'APPROVED' ||
                              activity.status === 'REJECTED'
                            }
                            onClick={async () => {
                              const email = primaryContact?.contact.email?.trim();
                              const notes = previewActivityId === activity.id
                                ? proposalDraftNotes
                                : activity.notes ?? '';
                              if (!email || !notes) return;
                              if (activity.emailDraftWebUrl && activity.status === 'CREATED') {
                                window.open(
                                  activity.emailDraftWebUrl,
                                  '_blank',
                                  'noopener,noreferrer',
                                );
                                return;
                              }

                              const emailWindow = window.open('about:blank', '_blank');
                              if (emailWindow) {
                                emailWindow.opener = null;
                                emailWindow.document.title = 'Preparing proposal email';
                                emailWindow.document.body.textContent =
                                  'Preparing your Outlook email with the PDF attached...';
                              }

                              try {
                                setProposalFileAction({
                                  activityId: activity.id,
                                  action: 'EMAIL',
                                });
                                const saved = notes === (activity.notes ?? '')
                                  ? activity
                                  : await saveProposalText(activity.id, notes);
                                if (!saved) {
                                  emailWindow?.close();
                                  return;
                                }
                                const updated = await createProposalEmailDraft(
                                  selectedProperty.id,
                                  saved,
                                  email,
                                  `Blue Life Pools Proposal - ${selectedProperty.name}`,
                                  notes,
                                );
                                if (activity.sentAt) {
                                  await recordProposalFollowUpForProperty(
                                    selectedProperty.id,
                                    activity.id,
                                    'Proposal follow-up email draft created with the PDF attached.',
                                    'EMAIL',
                                  );
                                }
                                if (updated.emailDraftWebUrl) {
                                  if (emailWindow) {
                                    emailWindow.location.href = updated.emailDraftWebUrl;
                                  } else {
                                    window.location.href = updated.emailDraftWebUrl;
                                  }
                                } else {
                                  emailWindow?.close();
                                  window.alert('The Outlook email draft could not be opened.');
                                }
                              } catch (error) {
                                emailWindow?.close();
                                console.error(error);
                                window.alert(
                                  error instanceof Error
                                    ? error.message
                                    : 'The Outlook email draft could not be created.',
                                );
                              } finally {
                                setProposalFileAction(null);
                              }
                            }}
                          >
                            {activeFileAction === 'EMAIL' ? 'Preparing Email...' : 'Send Email'}
                          </button>
                          <label className="status-control">
                            <select
                              value={activity.status === 'SENT' || activity.status === 'APPROVED' || activity.status === 'REJECTED' || activity.status === 'EXPIRED' ? activity.status : ''}
                              onChange={(event) =>
                                event.target.value && updateProposalStatus(
                                  activity.id,
                                  event.target.value as Exclude<SalesActivityStatus, 'CREATED'>,
                                )
                              }
                            >
                              <option value="">Set status...</option>
                              <option value="SENT">Sent - No Response</option>
                              <option value="APPROVED">Approved</option>
                              <option value="REJECTED">Rejected</option>
                              <option value="EXPIRED">Expired</option>
                            </select>
                          </label>
                          <button
                            className="delete-proposal-icon delete-proposal-bottom"
                            type="button"
                            aria-label="Delete proposal"
                            title="Delete proposal"
                            onClick={() => deleteProposal(activity.id)}
                          >
                            🗑
                          </button>
                        </div>
                      </aside>
                    );
                  })()}
                </div>
              )}
            </section>
          </div>
        ))}

        {propertyTab === 'estimates' && (
          <section className="detail-card property-tab-panel qb-estimates-panel">
            <div className="card-header">
              <div>
                <h2>QuickBooks estimates</h2>
                <p>Estimate status and financial details synchronized from QuickBooks.</p>
              </div>
              <span className="qb-sync-badge">Automatic sync</span>
            </div>
            {selectedProperty.quickbooksEstimates.length === 0 ? (
              <div className="property-tab-empty">
                <strong>No QuickBooks estimates linked</strong>
                <p>Once an estimate is synchronized, its number, status and line-item details will appear here.</p>
              </div>
            ) : (
              <div className="qb-estimate-list">
                {selectedProperty.quickbooksEstimates.map((estimate) => (
                  <details className="qb-estimate-card" key={estimate.id}>
                    <summary>
                      <span className="qb-estimate-summary-main">
                        <strong>Estimate #{estimate.estimateNumber}</strong>
                        <small>{estimate.estimateDate ? new Date(estimate.estimateDate).toLocaleDateString('en-US') : 'Date not available'}</small>
                      </span>
                      <span className={`qb-estimate-status qb-estimate-status-${estimate.status.toLowerCase().replace(/\s+/g, '-')}`}>{estimate.status}</span>
                      <b>{formatDashboardCurrency(Number(estimate.totalAmount ?? 0))}</b>
                    </summary>
                    <div className="qb-estimate-details">
                      <div className="qb-estimate-meta">
                        <span><small>Subtotal</small><b>{formatDashboardCurrency(Number(estimate.subtotalAmount ?? 0))}</b></span>
                        <span><small>Tax</small><b>{formatDashboardCurrency(Number(estimate.taxAmount ?? 0))}</b></span>
                        <span><small>Last synced</small><b>{estimate.lastSyncedAt ? new Date(estimate.lastSyncedAt).toLocaleString('en-US') : 'Not synchronized'}</b></span>
                      </div>
                      <div className="qb-estimate-lines">
                        <div className="qb-estimate-line qb-estimate-line-header"><span>Part / description</span><span>Qty</span><span>Unit price</span><span>Amount</span></div>
                        {estimate.lines.map((line) => (
                          <div className="qb-estimate-line" key={line.id}>
                            <span><strong>{line.itemName || line.description || 'Line item'}</strong>{line.itemName && line.description && <small>{line.description}</small>}</span>
                            <span>{line.quantity ?? '—'}</span>
                            <span>{line.unitPrice == null ? '—' : formatDashboardCurrency(Number(line.unitPrice))}</span>
                            <span>{line.amount == null ? '—' : formatDashboardCurrency(Number(line.amount))}</span>
                          </div>
                        ))}
                        {estimate.lines.length === 0 && <p className="qb-estimate-empty-lines">No line-item details available.</p>}
                      </div>
                      {estimate.customerMemo && <p className="qb-estimate-memo">{estimate.customerMemo}</p>}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </section>
        )}

        {propertyTab === 'contracts' && (
          <section className="detail-card property-tab-panel">
            <div className="card-header"><div><h2>Contracts</h2><p>Maintenance agreements created after an approved commercial proposal.</p></div><button className="secondary-button" type="button">+ Add contract</button></div>
            {approvedProposals === 0 ? <div className="property-tab-empty"><strong>No active maintenance contract</strong><p>When a maintenance proposal is approved, its contract stage will appear here.</p></div> : <div className="contract-summary"><div><span>Status</span><strong>Ready for contract</strong></div><div><span>Approved proposals</span><strong>{approvedProposals}</strong></div><div><span>SharePoint</span><strong>{selectedProperty.sharepointFolderUrl ? 'Folder ready' : 'Folder pending'}</strong></div></div>}
          </section>
        )}

        {propertyTab === 'quality' && (
          <section className="detail-card property-tab-panel property-quality-panel">
            <div className="card-header">
              <div>
                <h2>Quality inspections</h2>
                <p>Pool readings, chemical dosages and findings recorded for this property.</p>
              </div>
              <button className="secondary-button" type="button" onClick={() => navigateToArea('quality')}>
                Open Quality
              </button>
            </div>
            {propertyQualityLoading && <p className="property-tab-empty">Loading quality information...</p>}
            {!propertyQualityLoading && propertyQualityError && <p className="property-tab-empty"><strong>{propertyQualityError}</strong></p>}
            {!propertyQualityLoading && !propertyQualityError && propertyQualityInspections.length === 0 && (
              <div className="property-tab-empty">
                <strong>No quality inspections recorded</strong>
                <p>Quality visits for this property will appear here once they are saved.</p>
              </div>
            )}
            {!propertyQualityLoading && !propertyQualityError && propertyQualityInspections.length > 0 && (
              <div className="property-quality-list">
                {propertyQualityInspections.map((inspection) => (
                  <article className="property-quality-visit" key={inspection.id}>
                    <div className="property-quality-visit-header">
                      <div>
                        <span>{new Date(inspection.visitDate).toLocaleString('en-US', { timeZone: 'America/Bogota' })}</span>
                        <h3>{inspection.waterBody?.name || 'Pool not specified'}</h3>
                        <p>Technician: {inspection.technicianName}</p>
                      </div>
                      <strong>{inspection.findings.length} finding{inspection.findings.length === 1 ? '' : 's'}</strong>
                    </div>
                    <div className="property-quality-data-grid">
                      <div>
                        <h4>Readings</h4>
                        <div className="property-quality-values">
                          {Object.entries(inspection.readings || {}).filter(([, value]) => value).map(([key, value]) => {
                            const level = propertyReadingLevel(key, String(value));
                            return <span key={key} className={`property-quality-reading property-quality-reading-${level}`}><small>{key}</small><b>{value}</b>{level !== 'normal' && <em>{level === 'alert' ? 'Alert' : 'Review'}</em>}</span>;
                          })}
                          {Object.keys(inspection.readings || {}).length === 0 && <em>No readings recorded.</em>}
                        </div>
                      </div>
                      <div>
                        <h4>Dosages</h4>
                        <div className="property-quality-values">
                          {Object.entries(inspection.dosages || {}).filter(([, value]) => value).map(([key, value]) => (
                            <span key={key}><small>{key}</small><b>{value}</b></span>
                          ))}
                          {Object.keys(inspection.dosages || {}).length === 0 && <em>No dosages recorded.</em>}
                        </div>
                      </div>
                    </div>
                    {inspection.notes && <p className="property-quality-notes">{inspection.notes}</p>}
                    {inspection.findings.length > 0 && (
                      <div className="property-quality-findings">
                        <h4>Findings</h4>
                        {inspection.findings.map((finding, index) => (
                          <div className={`property-quality-finding property-quality-finding-${finding.severity.toLowerCase()}`} key={finding.id || `${inspection.id}-${index}`}>
                            <QualityFindingPhotos inspectionId={inspection.id} findingId={finding.id} revision={inspection.updatedAt || inspection.visitDate} onPreview={setPreviewQualityPhoto} />
                            <div>
                              <strong>{finding.description}</strong>
                              <span>{finding.severity.charAt(0) + finding.severity.slice(1).toLowerCase()} · {finding.status === 'IN_PROGRESS' ? 'In progress' : finding.status.charAt(0) + finding.status.slice(1).toLowerCase()}{finding.requiresEstimate ? ' · Requires estimate' : ''}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}


      </div>
    );
  }

  if (showDeleted) {
    return (
      <div className="page">
        <button
          className="back-button"
          onClick={() => setShowDeleted(false)}
        >
          ← Back to Properties
        </button>

        <header className="header">
          <div>
            <h1>Deleted Properties</h1>
            <p>Restore a property or remove it permanently.</p>
          </div>
        </header>

        <section className="properties-section">
          {deletedProperties.length === 0 ? (
            <div className="trash-empty">
              <h2>No deleted properties</h2>
              <p>Properties moved to the trash will appear here.</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Property</th>
                    <th>City</th>
                    <th>Deleted</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deletedProperties.map((property) => (
                    <tr key={property.id}>
                      <td><strong>{property.name}</strong></td>
                      <td>
                        {property.city ?? '-'}
                        {property.state ? `, ${property.state}` : ''}
                      </td>
                      <td>
                        {property.deletedAt
                          ? new Date(property.deletedAt).toLocaleDateString('en-US')
                          : '-'}
                      </td>
                      <td>
                        <div className="trash-actions">
                          <button
                            className="secondary-button"
                            onClick={() => restoreProperty(property)}
                            disabled={trashActionId === property.id}
                          >
                            Restore
                          </button>
                          <button
                            className="danger-link-button"
                            onClick={() => permanentlyDeleteProperty(property)}
                            disabled={trashActionId === property.id}
                          >
                            Delete permanently
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="page app-page commercial-workspace">
      {renderAppSidebar()}
      <header className="header commercial-page-header">
        <div>
          <span className="commercial-eyebrow">COMMERCIAL</span>
          <div className="commercial-page-title"><WorkspaceIcon name="chart" /><div><h1>Commercial Dashboard</h1><p>Property portfolio, proposals and commercial performance.</p></div></div>
        </div>
        <div className="header-actions commercial-header-actions">
          <CommercialPeriodFilter month={commercialMonth} months={commercialMonths} onChange={setCommercialMonth} name="Commercial proposal period" />
          {renderProposalReminderCenter()}
          <button className="secondary-button commercial-trash-button" onClick={() => setShowDeleted(true)}><WorkspaceIcon name="trash" />Deleted Properties ({deletedProperties.length})</button>
          <button className="primary-button" onClick={() => openCreateForm()}><WorkspaceIcon name="plus" />New Property</button>
        </div>
      </header>

      {isCreating && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="property-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-property-title"
          >
            <div className="edit-panel-header">
              <div>
                <h2 id="new-property-title">New Property</h2>
                <p>
                  Complete all required fields marked with *.
                </p>
              </div>

              <button
                className="modal-close"
                type="button"
                onClick={closeCreateForm}
                disabled={creating}
                aria-label="Close new property form"
              >
                ×
              </button>
            </div>

            <form onSubmit={createProperty} noValidate>
              <div className="form-grid">
                <div className="form-field form-field-wide">
                  <label htmlFor="new-name">Property Name *</label>
                  <input
                    id="new-name"
                    autoFocus
                    required
                    value={createForm.name}
                    onChange={(event) =>
                      updateCreateField('name', event.target.value)
                    }
                  />
                  {possiblePropertyMatches.length > 0 && (
                    <div
                      className={`property-match-review${hasExactPropertyMatch ? ' property-match-review-blocked' : ''}`}
                      role={hasExactPropertyMatch ? 'alert' : 'status'}
                    >
                      <strong>
                        {hasExactPropertyMatch
                          ? 'This property already appears to exist.'
                          : 'Possible property matches found.'}
                      </strong>
                      <p>
                        Review these records before creating a new property.
                      </p>
                      <ul>
                        {possiblePropertyMatches.map(({ property, reason }) => (
                          <li key={property.id}>
                            <span>
                              <b>{property.name}</b>
                              <small>{property.deletedAt ? 'Deleted record · ' : ''}{[property.addressLine1, property.city, property.state, property.zipCode].filter(Boolean).join(', ') || 'Address not assigned'} · {reason}</small>
                            </span>
                          </li>
                        ))}
                      </ul>
                      {!hasExactPropertyMatch && (
                        <label className="property-match-confirmation">
                          <input
                            type="checkbox"
                            checked={possibleMatchesReviewed}
                            onChange={(event) => setPossibleMatchesReviewed(event.target.checked)}
                          />
                          I reviewed these matches and this is a different property.
                        </label>
                      )}
                      {hasExactPropertyMatch && (
                        <small className="property-match-block-message">
                          Creation is blocked. Use the existing property record instead.
                        </small>
                      )}
                    </div>
                  )}
                </div>

                <div className="form-field">
                  <label htmlFor="new-type">Property Type *</label>
                  <select
                    id="new-type"
                    required
                    value={createForm.propertyType}
                    onChange={(event) =>
                      updateCreateField('propertyType', event.target.value)
                    }
                  >
                    <option value="">Select type</option>
                    <option value="COMMERCIAL">Commercial</option>
                    <option value="RESIDENTIAL">Residential</option>
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="new-segment">Segment *</label>
                  <select
                    id="new-segment"
                    required
                    value={createForm.segment}
                    onChange={(event) =>
                      updateCreateField('segment', event.target.value)
                    }
                  >
                    <option value="">Select segment</option>
                    <option value="MULTIFAMILY">Multifamily</option>
                    <option value="HOA">HOA</option>
                    <option value="HOTEL">Hotel</option>
                    <option value="SINGLE_FAMILY">Single Family</option>
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="new-management">Management Company</label>
                  <input
                    id="new-management"
                    value={createForm.managementCompanyName}
                    onChange={(event) =>
                      updateCreateField(
                        'managementCompanyName',
                        event.target.value,
                      )
                    }
                    placeholder="Example: ABC Property Management"
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="new-source">Lead Source *</label>
                  <select
                    id="new-source"
                    required
                    value={createForm.leadSource}
                    onChange={(event) =>
                      updateCreateField('leadSource', event.target.value)
                    }
                  >
                    <option value="">Select source</option>
                    <option value="ROUTE">Route</option>
                    <option value="REFERRAL">Referral</option>
                  </select>
                </div>

                <div className="form-field form-field-wide">
                  <label htmlFor="new-address">Address *</label>
                  <input
                    id="new-address"
                    required
                    value={createForm.addressLine1}
                    onChange={(event) =>
                      updateCreateField('addressLine1', event.target.value)
                    }
                  />
                </div>

                {([
                  ['city', 'City'],
                  ['county', 'County'],
                  ['state', 'State'],
                  ['zipCode', 'ZIP Code'],
                ] as Array<[keyof PropertyForm, string]>).map(
                  ([field, label]) => (
                    <div className="form-field" key={field}>
                      <label htmlFor={`new-${field}`}>{label} *</label>
                      <input
                        id={`new-${field}`}
                        required
                        value={createForm[field]}
                        onChange={(event) =>
                          updateCreateField(field, event.target.value)
                        }
                      />
                      {field === 'state' &&
                        createForm.state &&
                        !/^[A-Za-z]{2}$/.test(
                          createForm.state.trim(),
                        ) && (
                          <span className="field-error">
                            Use the 2-letter state code, for example FL.
                          </span>
                        )}
                      {field === 'zipCode' &&
                        createForm.zipCode &&
                        !/^\d{5}(-\d{4})?$/.test(
                          createForm.zipCode.trim(),
                        ) && (
                          <span className="field-error">
                            Enter a valid ZIP code (12345 or 12345-6789).
                          </span>
                        )}
                    </div>
                  ),
                )}

                <WaterBodiesEditor
                  bodies={createWaterBodies}
                  idPrefix="new-water-body"
                  onAdd={() => addWaterBody('create')}
                  onUpdate={(index, field, value) =>
                    updateWaterBody('create', index, field, value)
                  }
                  onRemove={(index) => removeWaterBody('create', index)}
                  onFilesSelected={(index, files) =>
                    selectWaterBodyPhotos('create', index, files)
                  }
                />

                <div className="form-section-title form-field-wide">
                  <div>
                    <h3>Contacts</h3>
                    <p>
                      A Property Manager with a valid email is required.
                    </p>
                  </div>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={addContact}
                  >
                    + Add contact
                  </button>
                </div>

                <div className="contacts-editor form-field-wide">
                  {createContacts.map((contact, index) => (
                    <div className="contact-editor" key={index}>
                      <div className="contact-editor-header">
                        <strong>Contact {index + 1}</strong>
                        {createContacts.length > 1 && (
                          <button
                            className="delete-button"
                            type="button"
                            onClick={() => removeContact(index)}
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="form-grid contact-fields">
                        <div className="form-field">
                          <label htmlFor={`contact-role-${index}`}>Role *</label>
                          <select
                            id={`contact-role-${index}`}
                            required
                            value={contact.role}
                            onChange={(event) =>
                              updateContactField(index, 'role', event.target.value)
                            }
                          >
                            <option value="">Select role</option>
                            <option value="PROPERTY_MANAGER">Property Manager</option>
                            <option value="REGIONAL_MANAGER">Regional Manager</option>
                            <option value="MAINTENANCE_CHIEF">Maintenance Chief</option>
                            <option value="OTHER">Other</option>
                          </select>
                        </div>

                        <div className="form-field">
                          <label htmlFor={`contact-email-${index}`}>Email *</label>
                          <input
                            id={`contact-email-${index}`}
                            type="email"
                            required
                            value={contact.email}
                            onChange={(event) =>
                              updateContactField(index, 'email', event.target.value)
                            }
                          />
                        </div>

                        <div className="form-field">
                          <label htmlFor={`contact-first-name-${index}`}>
                            First Name (optional)
                          </label>
                          <input
                            id={`contact-first-name-${index}`}
                            value={contact.firstName}
                            onChange={(event) =>
                              updateContactField(index, 'firstName', event.target.value)
                            }
                          />
                        </div>

                        <div className="form-field">
                          <label htmlFor={`contact-last-name-${index}`}>
                            Last Name (optional)
                          </label>
                          <input
                            id={`contact-last-name-${index}`}
                            value={contact.lastName}
                            onChange={(event) =>
                              updateContactField(index, 'lastName', event.target.value)
                            }
                          />
                        </div>

                        <div className="form-field">
                          <label htmlFor={`contact-phone-${index}`}>
                            Phone (optional)
                          </label>
                          <input
                            id={`contact-phone-${index}`}
                            type="tel"
                            value={contact.phone}
                            onChange={(event) =>
                              updateContactField(index, 'phone', event.target.value)
                            }
                          />
                        </div>

                        <label className="primary-contact-check">
                          <input
                            type="checkbox"
                            checked={contact.isPrimary}
                            onChange={() =>
                              updateContactField(index, 'isPrimary', true)
                            }
                          />
                          Primary contact
                        </label>
                      </div>
                    </div>
                  ))}

                  {!createContacts.some(
                    (contact) => contact.role === 'PROPERTY_MANAGER',
                  ) && (
                    <span className="field-error">
                      Add at least one Property Manager.
                    </span>
                  )}
                  {!contactEmailsAreUnique && (
                    <span className="field-error">
                      Contact email addresses cannot be repeated.
                    </span>
                  )}
                </div>

              </div>

              {createError && (
                <p className="form-error" role="alert">
                  {createError}
                </p>
              )}

              <div className="modal-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={closeCreateForm}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={!createFormIsValid || creating}
                >
                  {creating ? 'Creating...' : 'Create Property'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      <CommercialDashboard stats={dashboardStats} trend={commercialTrend} month={commercialMonth} months={commercialMonths} onMonthChange={setCommercialMonth} selectedStatus={proposalStatusFilter} onStatusChange={(status) => setProposalStatusFilter((current) => current === status ? null : status)} />

      <section className="properties-section">
        <div className="section-header">
          <div>
            <div className="commercial-directory-title"><WorkspaceIcon name="properties" /><div><h2>Properties</h2><p>Prospects and properties registered in BlueLife.</p></div></div>
            {proposalStatusFilter && <div className="property-proposal-filter">
              <span className={`proposal-status status-${proposalStatusFilter.toLowerCase()}`}>{proposalStatusLabel(proposalStatusFilter)}</span>
              <span>{displayedProperties.length} {displayedProperties.length === 1 ? 'property' : 'properties'}</span>
              <button type="button" onClick={() => setProposalStatusFilter(null)}>Show all</button>
            </div>}
          </div>
          <SearchField wrapperClassName="workspace-search-toolbar" aria-label="Search commercial properties" placeholder="Search by property, city, management…" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>
                  Property
                </th>
                <th>
                  SKU
                </th>
                <th>
                  City
                </th>
                <th>
                  Type
                </th>
                <th>
                  Segment
                </th>
                <th>
                  Management
                </th>
                <th>
                  Status
                </th>
                <th>
                  Proposals
                </th>
              </tr>
            </thead>

            <tbody>
              {displayedProperties.length === 0 ? (
                <tr>
                  <td className="properties-filter-empty" colSpan={8}>
                    {proposalStatusFilter
                      ? 'No properties have proposals in this status.'
                      : search.trim()
                        ? 'No properties match this search.'
                        : commercialMonth !== 'all'
                          ? 'No properties have proposals in this month.'
                        : 'No properties registered yet.'}
                  </td>
                </tr>
              ) : displayedProperties.map(
                (property) => (
                  <tr
                    key={
                      property.id
                    }
                    className="clickable-row"
                    onClick={() =>
                      openProperty(
                        property.id,
                      )
                    }
                  >
                    <td>
                      <strong>
                        {
                          property.name
                        }
                      </strong>
                    </td>

                    <td>
                      <span className="sku-code">
                        {propertySku(property.id)}
                      </span>
                    </td>

                    <td>
                      {property.city ??
                        '-'}

                      {property.state
                        ? `, ${property.state}`
                        : ''}
                    </td>

                    <td>
                      {formatLabel(
                        property.propertyType,
                      )}
                    </td>

                    <td>
                      {formatLabel(
                        property.segment,
                      )}
                    </td>

                    <td>
                      {property
                        .managementCompany
                        ?.name ?? '-'}
                    </td>

                    <td>
                      <span className={`lifecycle-badge lifecycle-${property.lifecycleStatus === 'INACTIVE' ? 'inactive' : property.lifecycleStatus === 'CLIENT' ? 'client' : 'lead'}`}>
                        {property.lifecycleStatus === 'INACTIVE' ? 'Inactive' : property.lifecycleStatus === 'CLIENT' ? 'Client' : 'Lead'}
                      </span>
                    </td>

                    <td>
                      <span className="proposal-count">
                        {property.salesActivities.filter(
                          (activity) => proposalInPeriod(activity, commercialMonth),
                        ).length}
                      </span>
                    </td>

                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>

      {detailLoading && (
        <div className="loading-overlay">
          Loading property...
        </div>
      )}
      {previewQualityPhoto && <div className="history-quality-lightbox" role="dialog" aria-modal="true" aria-label="Finding photo preview" onClick={() => setPreviewQualityPhoto(null)}><button type="button" onClick={() => setPreviewQualityPhoto(null)} aria-label="Close photo">×</button><img src={previewQualityPhoto.data} alt={previewQualityPhoto.name || 'Finding'} /></div>}
    </div>
  );
}

export default App;
