export type BusinessType = 'freelance' | 'property' | 'both' | 'personal'

export interface TerminologySet {
  sidebarSectionLabel: string
  hubLabel: string
  hubIcon: string
  hubHref: string
  addLabel: string
  addHref: string
  hubPageTitle: string
  hubPageSubtitle: string
  entitySingular: string
  entityPlural: string
}

const TERM_MAP: Record<BusinessType, TerminologySet> = {
  freelance: {
    sidebarSectionLabel: 'Clients',
    hubLabel: 'Client Hub',
    hubIcon: '🎯',
    hubHref: '/studio',
    addLabel: 'Add Client',
    addHref: '/projects/new?type=CLIENT',
    hubPageTitle: 'Client Hub',
    hubPageSubtitle: 'Overview of your clients, jobs, and invoices',
    entitySingular: 'client',
    entityPlural: 'clients',
  },
  property: {
    sidebarSectionLabel: 'Properties',
    hubLabel: 'Properties',
    hubIcon: '🏘️',
    hubHref: '/portfolio',
    addLabel: 'Add Property',
    addHref: '/projects/new?type=PROPERTY',
    hubPageTitle: 'Properties',
    hubPageSubtitle: 'Manage your rental properties, units, and tenants',
    entitySingular: 'property',
    entityPlural: 'properties',
  },
  both: {
    sidebarSectionLabel: 'Clients & Properties',
    hubLabel: 'Client Hub',
    hubIcon: '🎯',
    hubHref: '/studio',
    addLabel: 'Add Client / Property',
    addHref: '/projects/new',
    hubPageTitle: 'Client Hub',
    hubPageSubtitle: 'Overview of your clients, jobs, and invoices',
    entitySingular: 'client or property',
    entityPlural: 'clients and properties',
  },
  personal: {
    sidebarSectionLabel: 'Projects',
    hubLabel: 'Projects',
    hubIcon: '📁',
    hubHref: '/projects',
    addLabel: 'Add Project',
    addHref: '/projects/new?type=OTHER',
    hubPageTitle: 'Projects',
    hubPageSubtitle: 'Organize your finances by project',
    entitySingular: 'project',
    entityPlural: 'projects',
  },
}

export function getTerminology(bt: BusinessType | null): TerminologySet {
  return TERM_MAP[bt ?? 'personal'] ?? TERM_MAP.personal
}

export function getEntityLabel(workspaceType: string, bt?: BusinessType | null): string {
  if (workspaceType === 'CLIENT') return 'Client'
  if (workspaceType === 'PROPERTY') return 'Property'
  if (bt === 'personal') return 'Project'
  return 'Overhead'
}
