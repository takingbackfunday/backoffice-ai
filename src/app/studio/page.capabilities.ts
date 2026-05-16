import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/studio',
  title: 'Client Hub',
  purpose: 'Overview of all freelance clients — outstanding invoices, overdue amounts, and quick invoice/work-order actions.',
  jobsToBeDone: [
    'See which clients owe money (overdue and outstanding balances)',
    'Create a new invoice for a client',
    'Mark unsent draft invoices as sent',
    'Create a new work order or intake a subcontractor bill',
    'Filter client cards by payment status (overdue, outstanding, collected)',
  ],
  deepLinks: {},
  reads: ['Project', 'Invoice', 'Quote', 'ClientProfile', 'Job'],
  writes: ['Invoice', 'WorkOrder', 'Bill'],
  relatedRoutes: ['/projects', '/vendors'],
}
