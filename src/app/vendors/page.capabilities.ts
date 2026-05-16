import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/vendors',
  title: 'Vendors',
  purpose: 'Manage subcontractors and vendors — view payment history, documents, and add new vendors.',
  jobsToBeDone: [
    'See all vendors and subcontractors with their contact and tax info',
    'Add a new vendor or subcontractor',
    'View total paid to a vendor across all work orders',
    'Navigate to a vendor\'s detail page for documents and payment history',
  ],
  deepLinks: {},
  reads: ['Vendor', 'VendorDocument', 'WorkOrder', 'Bill'],
  writes: ['Vendor'],
  relatedRoutes: ['/vendors/[vendorId]'],
}
