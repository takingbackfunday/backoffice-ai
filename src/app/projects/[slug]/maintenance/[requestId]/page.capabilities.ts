import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/maintenance/[requestId]',
  title: 'Maintenance request',
  purpose: 'View and manage a single maintenance request — see description, unit, work order, and bills.',
  jobsToBeDone: [
    'See the full description and priority of a maintenance issue',
    'Assign a vendor and create a work order for this request',
    'Add a bill once the work is completed',
    'Update the request status (open, in-progress, completed)',
    'See which unit the request is associated with',
  ],
  deepLinks: {},
  reads: ['MaintenanceRequest', 'Unit', 'WorkOrder', 'Bill', 'Vendor'],
  writes: ['MaintenanceRequest', 'WorkOrder', 'Bill'],
  relatedRoutes: [
    '/projects/[slug]/maintenance',
    '/projects/[slug]/units/[unitId]',
    '/vendors',
  ],
}
