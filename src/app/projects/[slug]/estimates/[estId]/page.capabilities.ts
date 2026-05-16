import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/estimates/[estId]',
  title: 'Edit estimate',
  purpose: 'View and edit an existing cost estimate — modify sections, line items, hours, quantities, and cost rates.',
  jobsToBeDone: [
    'Add, remove, or edit estimate sections and line items',
    'Update hours, quantities, and cost rates',
    'Change estimate status to final',
    'Link the estimate to a job',
    'Use this estimate as the basis for a quote',
  ],
  deepLinks: {},
  reads: ['Estimate', 'EstimateSection', 'EstimateItem', 'Job'],
  writes: ['Estimate', 'EstimateSection', 'EstimateItem'],
  editorContext: 'estimate',
  relatedRoutes: [
    '/projects/[slug]/estimates',
    '/projects/[slug]/quotes/new',
  ],
}
