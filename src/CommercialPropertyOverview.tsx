import { WorkspaceIcon } from './WorkspaceIcon';

type OverviewProperty = {
  propertyType: string | null; segment: string | null; leadSource: string | null; lifecycleStatus: string;
  managementCompany: { name: string } | null;
  addressLine1: string | null; city: string | null; county: string | null; state: string | null; zipCode: string | null;
  sharepointFolderUrl: string | null;
  contacts: Array<{ id: string; role: string | null; contact: { firstName: string | null; lastName: string | null; email: string | null; phone: string | null } }>;
  waterBodies: Array<{ id: string; name: string; type: string; size: string | null; gallons: number | null }>;
};

export function CommercialPropertyOverview({ property, serviceStart, formatLabel, onEdit, onRetrySharePoint, creatingSharePoint }: {
  property: OverviewProperty; serviceStart: string;
  formatLabel: (value: string | null) => string;
  onEdit: () => void; onRetrySharePoint: () => void; creatingSharePoint: boolean;
}) {
  const status = property.lifecycleStatus === 'INACTIVE' ? 'Inactive' : property.lifecycleStatus === 'CLIENT' ? 'Client' : 'Lead';
  const fields = [
    { label: 'Property Type', value: formatLabel(property.propertyType), icon: 'home' },
    { label: 'Lead Source', value: formatLabel(property.leadSource), icon: 'tag' },
    { label: 'Segment', value: formatLabel(property.segment), icon: 'layers' },
    { label: 'Commercial Status', value: status, icon: 'users', status: true },
    { label: 'Service Start', value: serviceStart, icon: 'calendar' },
    { label: 'Management Company', value: property.managementCompany?.name || '—', icon: 'properties' },
  ] as const;
  const address = [
    { label: 'Address', value: property.addressLine1, icon: 'pin' },
    { label: 'City', value: property.city, icon: 'properties' },
    { label: 'County', value: property.county, icon: 'map' },
    { label: 'State / ZIP', value: [property.state, property.zipCode].filter(Boolean).join(' '), icon: 'pin' },
  ] as const;
  return <section className="property-overview-layout" aria-label="General information">
    <article className="property-overview-section property-information-section">
      <div className="property-overview-heading"><h2><WorkspaceIcon name="info" />Property Information</h2><button type="button" className="property-overview-edit" onClick={onEdit}><WorkspaceIcon name="edit" />Edit</button></div>
      <dl className="property-overview-fields">{fields.map((field) => <div key={field.label}><dt><WorkspaceIcon name={field.icon} /><span>{field.label}</span></dt><dd>{'status' in field ? <span className={`lifecycle-badge lifecycle-${property.lifecycleStatus.toLowerCase()}`}>{field.value}</span> : field.value}</dd></div>)}</dl>
    </article>
    <article className="property-overview-section property-address-section"><div className="property-overview-heading"><h2><WorkspaceIcon name="pin" />Address</h2></div><dl className="property-address-list">{address.map((field) => <div key={field.label}><dt><WorkspaceIcon name={field.icon} /><span>{field.label}</span></dt><dd>{field.value || '—'}</dd></div>)}</dl></article>
    <article className="property-overview-section property-contacts-section"><div className="property-overview-heading"><h2><WorkspaceIcon name="users" />Contacts</h2></div>
      {property.contacts.length ? <div className="property-contact-list">{property.contacts.map((relation) => {
        const contact = relation.contact;
        const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || 'Unnamed Contact';
        const initials = [contact.firstName?.[0], contact.lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?';
        return <div className="property-contact-row" key={relation.id}><span className="property-contact-avatar" aria-hidden="true">{initials}</span><div className="property-contact-person"><strong>{name}</strong><span>{formatLabel(relation.role)}</span></div><div className="property-contact-methods"><span><WorkspaceIcon name="mail" />{contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : 'No email registered'}</span><span><WorkspaceIcon name="phone" />{contact.phone ? <a href={`tel:${contact.phone}`}>{contact.phone}</a> : 'No phone registered'}</span></div></div>;
      })}</div> : <p className="property-overview-empty">No contacts registered.</p>}
    </article>
    <article className="property-overview-section property-water-section"><div className="property-overview-heading"><h2><WorkspaceIcon name="pool" />Water Bodies</h2></div>
      {property.waterBodies.length ? <div className="property-water-summary"><strong>{property.waterBodies.length} total</strong><div className="property-water-tags">{property.waterBodies.map((body) => <span key={body.id}>{formatLabel(body.type)} · {body.name}{body.size && body.type !== 'SPA' ? ` · ${formatLabel(body.size)}` : ''}{body.gallons ? ` · ${body.gallons.toLocaleString('en-US')} gal` : ''}</span>)}</div></div> : <p className="property-overview-empty">No water bodies registered.</p>}
    </article>
    <article className="property-overview-section property-sharepoint-section"><div className="property-overview-heading"><h2><WorkspaceIcon name="folder" />SharePoint</h2></div>
      {property.sharepointFolderUrl ? <a className="property-folder-link" href={property.sharepointFolderUrl} target="_blank" rel="noreferrer"><WorkspaceIcon name="external" />Open Property Folder</a> : <div className="property-folder-pending"><p className="property-overview-empty">The SharePoint folder is not available yet.</p><button type="button" className="property-overview-edit" onClick={onRetrySharePoint} disabled={creatingSharePoint}>{creatingSharePoint ? 'Creating folder...' : 'Retry SharePoint'}</button></div>}
    </article>
  </section>;
}
