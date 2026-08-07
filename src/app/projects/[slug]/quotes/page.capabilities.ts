import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/quotes',
  title: 'Quotes',
  purpose: 'List all client-facing quotes for a project — see status, totals, and create new quotes.',
  jobsToBeDone: [
    'See all quotes and their status (draft, sent, accepted, rejected, superseded)',
    'Check which quotes have been signed or accepted',
    'Create a new quote',
    'Download quote PDFs to send via your own email',
    'Navigate to a quote to view, edit, download, or track it',
  ],
  deepLinks: {},
  reads: ['Quote', 'Job', 'ClientProfile'],
  writes: ['Quote'],
  relatedRoutes: [
    '/projects/[slug]/quotes/new',
    '/settings',
  ],
}
