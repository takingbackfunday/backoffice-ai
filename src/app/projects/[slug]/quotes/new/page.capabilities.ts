import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/quotes/new',
  title: 'New quote',
  purpose: 'Create a new client-facing quote, optionally linked to a job or estimate.',
  jobsToBeDone: [
    'Start a new quote for a client project',
    'Link the quote to an active job',
    'Base the quote on an existing estimate',
    'Set the quote title and initial details',
  ],
  deepLinks: {},
  reads: ['Job', 'Estimate', 'ClientProfile'],
  writes: ['Quote'],
  relatedRoutes: [
    '/projects/[slug]/quotes',
    '/projects/[slug]/quotes/[quoteId]/generate',
    '/projects/[slug]/estimates',
  ],
}
