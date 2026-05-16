import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/vendors/[vendorId]',
  title: 'Vendor detail',
  purpose: 'View a single vendor — contact info, assigned work orders, bills, linked transactions, and uploaded documents.',
  jobsToBeDone: [
    'See all work orders assigned to this vendor',
    'View bills and payments for this vendor',
    'See transactions linked to this vendor',
    'Upload or view vendor documents (contracts, insurance, etc.)',
    'Edit vendor contact details',
    'Create a new work order for this vendor',
  ],
  deepLinks: {},
  reads: ['Vendor', 'Document', 'WorkOrder', 'Bill', 'Transaction'],
  writes: ['Vendor', 'Document', 'WorkOrder'],
  relatedRoutes: [
    '/vendors',
    '/transactions',
    '/projects/[slug]/work-orders',
  ],
}
