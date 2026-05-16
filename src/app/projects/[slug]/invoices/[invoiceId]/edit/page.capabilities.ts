import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/invoices/[invoiceId]/edit',
  title: 'Edit invoice',
  purpose: 'Modify an existing invoice — line items, tax, dates, currency, notes, and payment instructions.',
  jobsToBeDone: [
    'Add, remove, or edit line items',
    'Change due date or issue date',
    'Add or change tax (VAT, sales tax)',
    'Change the invoice currency',
    'Update notes or payment terms',
    'Save changes or send the updated invoice',
  ],
  deepLinks: {},
  reads: ['Invoice', 'InvoiceLineItem', 'UserPreference'],
  writes: ['Invoice', 'InvoiceLineItem'],
  editorContext: 'invoice',
  relatedRoutes: [
    '/settings#invoice-notes-default',
    '/settings#payment-instructions',
    '/projects/[slug]/invoices/[invoiceId]',
  ],
}
