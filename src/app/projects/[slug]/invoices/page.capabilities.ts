import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/invoices',
  title: 'Invoices',
  purpose: 'List all invoices for a project — filter by status, see totals, create new invoices.',
  jobsToBeDone: [
    'See all invoices for a client or property project',
    'Filter invoices by status (draft, sent, paid, overdue, void)',
    'See invoice totals and payment summaries',
    'Create a new invoice for this project',
    'Navigate to an invoice detail or edit page',
    'Download or send an invoice by email',
  ],
  deepLinks: {},
  reads: ['Invoice', 'InvoiceLineItem', 'Payment', 'Job', 'UserPreference'],
  writes: ['Invoice'],
  relatedRoutes: [
    '/projects/[slug]/invoices/new',
    '/settings#invoice-notes-default',
    '/settings#payment-instructions',
  ],
}
