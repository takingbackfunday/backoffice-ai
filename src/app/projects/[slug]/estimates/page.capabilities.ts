import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/estimates',
  title: 'Estimates',
  purpose: 'List all cost estimates for a client project — view status, cost totals, and create new estimates.',
  jobsToBeDone: [
    'See all estimates for a project and their status (draft, final, superseded)',
    'View cost totals per estimate',
    'Create a new estimate',
    'Navigate to an estimate to view or edit it',
  ],
  deepLinks: {},
  reads: ['Estimate', 'EstimateSection', 'EstimateItem'],
  writes: ['Estimate'],
  relatedRoutes: [
    '/projects/[slug]/estimates/new',
    '/projects/[slug]/quotes',
  ],
}
