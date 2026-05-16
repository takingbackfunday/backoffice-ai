import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/time',
  title: 'Time tracking',
  purpose: 'Track billable hours for a client project — log time entries against jobs and see totals.',
  jobsToBeDone: [
    'Log a new time entry for a job on this project',
    'See total hours logged per job',
    'Edit or delete a time entry',
    'View billable hours ready to invoice',
  ],
  deepLinks: {},
  reads: ['TimeEntry', 'Job'],
  writes: ['TimeEntry'],
  relatedRoutes: [
    '/projects/[slug]/jobs',
    '/projects/[slug]/invoices/new',
  ],
}
