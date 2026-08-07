import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]',
  title: 'Project overview',
  purpose: 'Overview page for a single project — CLIENT shows active jobs and client info; PROPERTY shows unit occupancy and rent status.',
  jobsToBeDone: [
    'See a summary of active jobs and outstanding invoices for a client project',
    'See unit occupancy, rent status, and upcoming lease renewals for a property',
    'Edit client contact details (name, email, phone, company)',
    'Navigate to invoices, quotes, jobs, or work orders for a client project',
    'Navigate to units, leases, tenants, maintenance, or financials for a property',
  ],
  deepLinks: {},
  reads: ['Workspace', 'ClientProfile', 'Job', 'PropertyProfile', 'Unit', 'Lease', 'Tenant', 'Invoice', 'InvoiceLineItem', 'Payment'],
  writes: ['ClientProfile'],
  relatedRoutes: [
    '/projects/[slug]/invoices',
    '/projects/[slug]/jobs',
    '/projects/[slug]/units',
    '/projects/[slug]/financials',
  ],
}
