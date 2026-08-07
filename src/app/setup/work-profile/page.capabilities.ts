import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/setup/work-profile',
  title: 'Set up work profile',
  purpose: 'First-time setup where users describe their work in plain English so AI generates quote templates and a service-item library.',
  jobsToBeDone: [
    'Describe your profession and services in a few sentences',
    'Generate quote templates and a reusable service-item library from the description',
    'Review generated templates and items before saving',
    'Skip setup and do it later from Settings',
  ],
  reads: ['UserPreference'],
  writes: ['QuoteTemplate', 'ServiceItem'],
  deepLinks: {},
}
