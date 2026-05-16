import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/jobs/[jobId]',
  title: 'Job detail',
  purpose: 'View a single job — see linked quotes, invoices, work orders, cost margin summary, and manage subcontractor work orders.',
  jobsToBeDone: [
    'See all invoices and quotes linked to a specific job',
    'View cost vs. revenue margin for this job',
    'Create a new work order for a subcontractor on this job',
    'Add a bill against an existing work order',
    'Change the job status (active, on hold, completed)',
    'See total billed, total cost, and margin percentage',
  ],
  deepLinks: {},
  reads: ['Job', 'Invoice', 'InvoiceLineItem', 'Quote', 'WorkOrder', 'Bill', 'Vendor'],
  writes: ['Job', 'WorkOrder', 'Bill'],
  relatedRoutes: [
    '/projects/[slug]/jobs',
    '/projects/[slug]/invoices/new',
    '/projects/[slug]/work-orders',
    '/vendors',
  ],
}
