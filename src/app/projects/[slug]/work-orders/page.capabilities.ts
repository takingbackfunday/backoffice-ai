import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/work-orders',
  title: 'Work orders',
  purpose: 'List all work orders for a client project — see vendor assignments, agreed costs, bill status, and manage subcontractor work.',
  jobsToBeDone: [
    'See all work orders for this project and their status',
    'Check which work orders have been billed and which are outstanding',
    'Create a new work order for a subcontractor',
    'Assign or change the vendor on a work order',
    'Add a bill against a completed work order',
    'See the agreed cost and actual billed amount per work order',
  ],
  deepLinks: {},
  reads: ['WorkOrder', 'Vendor', 'Job', 'Bill'],
  writes: ['WorkOrder', 'Bill'],
  relatedRoutes: [
    '/projects/[slug]/jobs/[jobId]',
    '/vendors',
    '/transactions',
  ],
}
