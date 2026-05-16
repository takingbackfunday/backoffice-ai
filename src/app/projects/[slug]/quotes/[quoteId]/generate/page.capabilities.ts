import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/quotes/[quoteId]/generate',
  title: 'Generate quote',
  purpose: 'Review and finalise quote line items from an estimate before sending to the client — set margins, review totals, and confirm pricing.',
  jobsToBeDone: [
    'Review estimate line items and set sell prices or margins',
    'See cost vs sell price to check profitability before sending',
    'Edit estimate sections and items inline while reviewing the quote',
    'Finalise and generate the quote ready to send',
  ],
  deepLinks: {},
  reads: ['Quote', 'QuoteSection', 'QuoteItem', 'Estimate', 'EstimateSection', 'EstimateItem'],
  writes: ['Quote', 'QuoteSection', 'QuoteItem'],
  relatedRoutes: [
    '/projects/[slug]/quotes/[quoteId]',
    '/settings',
  ],
}
