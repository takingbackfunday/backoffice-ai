import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/estimates/new',
  title: 'New estimate',
  purpose: 'Create a new cost estimate — add sections and line items with hours, quantities, and cost rates.',
  jobsToBeDone: [
    'Add sections and line items to a new estimate',
    'Set hours, quantities, and cost rates per item',
    'Link the estimate to an active job',
    'Save the estimate as a draft',
  ],
  deepLinks: {},
  reads: ['Workspace', 'ClientProfile', 'Job'],
  writes: ['Estimate', 'EstimateSection', 'EstimateItem'],
  editorContext: 'estimate',
  relatedRoutes: [
    '/projects/[slug]/estimates',
    '/projects/[slug]/quotes/new',
  ],
}
