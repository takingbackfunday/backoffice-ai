import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/units/[unitId]',
  title: 'Unit detail',
  purpose: 'View and manage a single rental unit — lease history, tenant info, rent invoices, maintenance requests, and unit details.',
  jobsToBeDone: [
    'See the current lease and tenant for this unit',
    'View outstanding and paid rent invoices for this unit',
    'Check open maintenance requests for this unit',
    'Edit unit details (label, bedrooms, rent amount)',
    'Create a new lease for a vacant unit',
    'End a lease or mark it as month-to-month',
  ],
  deepLinks: {},
  reads: ['Unit', 'Lease', 'Tenant', 'Invoice', 'InvoiceLineItem', 'Payment', 'MaintenanceRequest'],
  writes: ['Unit', 'Lease'],
  relatedRoutes: [
    '/projects/[slug]/units',
    '/projects/[slug]/tenants/[tenantId]',
    '/projects/[slug]/maintenance',
  ],
}
