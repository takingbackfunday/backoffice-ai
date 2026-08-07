import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/quotes/[quoteId]/amend',
  title: 'Quote amendment',
  purpose: 'Create a change order (amendment) to an accepted quote — add or modify line items with adjusted pricing.',
  jobsToBeDone: [
    'Add change order line items with descriptions, quantities, and prices',
    'Review the amendment total before submitting',
    'Create the amendment and navigate to its detail page',
  ],
  deepLinks: {},
  reads: ['Quote', 'QuoteSection', 'QuoteLineItem'],
  writes: ['Quote', 'QuoteSection', 'QuoteLineItem'],
  relatedRoutes: [
    '/projects/[slug]/quotes/[quoteId]',
    '/projects/[slug]/quotes',
  ],
}
