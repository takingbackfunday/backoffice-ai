import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/quotes/[quoteId]',
  title: 'Quote detail',
  purpose: 'View a client quote — see sections, line items, pricing, status, and manage signatures or amendments.',
  jobsToBeDone: [
    'Review quote sections, items, and total pricing',
    'Send the quote to the client by email',
    'Mark a quote as accepted or rejected',
    'Create an amendment to a signed quote',
    'Convert an accepted quote to an invoice',
    'See previous and next versions of this quote',
  ],
  deepLinks: {
    'pipeline-breadcrumb': 'Pipeline breadcrumb showing quote → invoices chain',
    'fulfillment': 'Fulfillment bar for accepted quotes (invoicing progress)',
    'amendments': 'Amendments list for this quote',
  },
  reads: ['Quote', 'QuoteSection', 'QuoteItem', 'Job', 'ClientProfile'],
  writes: ['Quote'],
  relatedRoutes: [
    '/projects/[slug]/quotes',
    '/projects/[slug]/invoices/new',
  ],
}
