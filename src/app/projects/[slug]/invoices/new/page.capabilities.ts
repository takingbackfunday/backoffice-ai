import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/invoices/new',
  title: 'New invoice',
  purpose: 'Create a new invoice for a client or property project — add line items, set tax, dates, currency, and payment instructions.',
  jobsToBeDone: [
    'Add line items to a new invoice',
    'Set issue date and due date',
    'Apply tax (VAT, sales tax, etc.)',
    'Set the invoice currency',
    'Add notes and payment instructions',
    'Save a draft or send the invoice immediately',
    'Link the invoice to a specific job',
  ],
  deepLinks: {},
  reads: ['Workspace', 'ClientProfile', 'Job', 'PropertyProfile', 'Unit', 'Lease', 'Tenant', 'UserPreference'],
  writes: ['Invoice', 'InvoiceLineItem'],
  editorContext: 'invoice',
  relatedRoutes: [
    '/settings#invoice-notes-default',
    '/settings#payment-instructions',
    '/projects/[slug]/invoices',
  ],
}
