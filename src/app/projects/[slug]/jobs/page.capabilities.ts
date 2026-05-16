import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/jobs',
  title: 'Jobs',
  purpose: 'List all jobs for a client project — see status, billing type, and navigate to job details.',
  jobsToBeDone: [
    'See all jobs for this client and their status (draft, active, on hold, completed)',
    'Create a new job',
    'Navigate to a job to see its invoices, quotes, and work orders',
    'See billing type for each job (fixed price, time and materials, retainer)',
  ],
  deepLinks: {},
  reads: ['Job', 'ClientProfile'],
  writes: ['Job'],
  relatedRoutes: [
    '/projects/[slug]/jobs/[jobId]',
    '/projects/[slug]/invoices',
    '/projects/[slug]/work-orders',
  ],
}
