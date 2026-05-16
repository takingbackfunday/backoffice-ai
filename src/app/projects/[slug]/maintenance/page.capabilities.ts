import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/maintenance',
  title: 'Maintenance',
  purpose: 'Board view of all maintenance requests for a property — track open, in-progress, and completed requests.',
  jobsToBeDone: [
    'See all open and in-progress maintenance requests',
    'Check which requests have a work order assigned',
    'Create a new maintenance request',
    'Filter requests by unit or priority',
    'Navigate to a request to see details and assign a vendor',
  ],
  deepLinks: {},
  reads: ['MaintenanceRequest', 'Unit', 'WorkOrder'],
  writes: ['MaintenanceRequest'],
  relatedRoutes: [
    '/projects/[slug]/maintenance/[requestId]',
    '/projects/[slug]/units',
    '/vendors',
  ],
}
