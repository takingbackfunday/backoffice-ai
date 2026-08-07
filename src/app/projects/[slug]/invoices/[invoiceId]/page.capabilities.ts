import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/invoices/[invoiceId]',
  title: 'Invoice detail',
  purpose: 'View a single invoice — see line items, payment history, status, and download or send options.',
  jobsToBeDone: [
    'Review a sent or paid invoice',
    'See the payment history and outstanding balance',
    'Download the invoice as a PDF',
    'Send or resend the invoice by email',
    'Mark an invoice as sent or paid manually',
    'Void an invoice',
    'Navigate to the edit page to make changes',
  ],
  deepLinks: {
    'pipeline-breadcrumb': 'Pipeline breadcrumb showing quote → invoice chain',
    'history': 'Renegotiation history panel (collapsed)',
    'payments': 'Payments section with record payment form',
  },
  reads: ['Invoice', 'InvoiceLineItem', 'Payment', 'UserPreference'],
  writes: ['Invoice'],
  relatedRoutes: [
    '/projects/[slug]/invoices/[invoiceId]/edit',
    '/projects/[slug]/invoices',
    '/settings#payment-instructions',
  ],
}
