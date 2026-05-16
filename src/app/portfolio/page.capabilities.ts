import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/portfolio',
  title: 'Portfolio',
  purpose: 'Property portfolio dashboard showing occupancy rates, rent roll, and maintenance overview.',
  jobsToBeDone: [
    'See occupancy rates across all properties',
    'View total monthly rent and vacancy loss',
    'Check which leases are expiring soon',
    'See open maintenance requests across all properties',
    'Navigate to a specific property',
  ],
  deepLinks: {},
  reads: ['Project', 'Unit', 'Lease', 'MaintenanceRequest', 'Tenant'],
  writes: [],
  relatedRoutes: ['/projects'],
}
