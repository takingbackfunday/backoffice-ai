import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/quotes/[quoteId]/edit',
  title: 'Quote editor',
  purpose: 'Edit a draft quote — modify sections, line items, pricing, terms, costs, and tags.',
  jobsToBeDone: [
    'Edit quote title, currency, and validity period',
    'Add, remove, or reorder sections and line items',
    'Set item prices, quantities, units, and cost rates',
    'Apply margin rules and tag items for auto-pricing',
    'Review a blended margin percentage',
    'Save draft or save and download the quote PDF',
  ],
  deepLinks: {},
  reads: ['Quote', 'QuoteSection', 'QuoteLineItem', 'MarginRule'],
  writes: ['Quote', 'QuoteSection', 'QuoteLineItem'],
  editorContext: 'quote',
  relatedRoutes: [
    '/projects/[slug]/quotes/[quoteId]',
    '/projects/[slug]/quotes',
  ],
}
