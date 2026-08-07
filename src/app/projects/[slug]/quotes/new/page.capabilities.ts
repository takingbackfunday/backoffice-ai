import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/quotes/new',
  title: 'New quote',
  purpose: 'Create a new client-facing quote for a client project.',
  jobsToBeDone: [
    'Start a new quote for a client project',
    'Link the quote to an active job',
    'Set the quote title and initial details',
  ],
  deepLinks: {},
  reads: ['Job', 'ClientProfile'],
  writes: ['Quote'],
  relatedRoutes: [
    '/projects/[slug]/quotes',
  ],
}
