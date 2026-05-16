import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/tenants/[tenantId]',
  title: 'Tenant detail',
  purpose: 'View a single tenant — contact info, lease history, rent invoice status, and maintenance requests.',
  jobsToBeDone: [
    'See tenant contact details (name, email, phone)',
    'View the tenant\'s current and past leases',
    'Check outstanding and paid rent invoices for this tenant',
    'See open maintenance requests submitted by this tenant',
    'Send a message to this tenant',
    'Edit tenant contact information',
  ],
  deepLinks: {},
  reads: ['Tenant', 'Lease', 'Unit', 'Invoice', 'InvoiceLineItem', 'Payment', 'MaintenanceRequest'],
  writes: ['Tenant', 'Lease'],
  relatedRoutes: [
    '/projects/[slug]/tenants',
    '/projects/[slug]/messages/[tenantId]',
    '/projects/[slug]/units/[unitId]',
  ],
}
