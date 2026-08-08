import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/invoices/[invoiceId]',
  title: 'Invoice detail',
  purpose: 'View a single invoice — see line items, payment history, and status. Download the PDF to send via your own email (primary flow), or send by email from the overflow menu.',
  jobsToBeDone: [
    'Review a sent or paid invoice',
    'See the payment history and outstanding balance',
    'Download the invoice PDF and mark it sent (optional: send by email from the overflow menu)',
    'Track status via the Draft → Sent → Paid stepper',
    'Record a payment or link a bank transaction',
    'Void or renegotiate an invoice',
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
