import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/new',
  title: 'New project',
  purpose: 'Create a new workspace — choose type (client, property, or other), name it, and set it up.',
  jobsToBeDone: [
    'Create a new client project for a freelance client',
    'Create a new property project for a rental property',
    'Create a general other project for tracking miscellaneous expenses',
    'Set the project name and description',
  ],
  deepLinks: {},
  reads: [],
  writes: ['Workspace', 'ClientProfile', 'PropertyProfile'],
  relatedRoutes: [
    '/projects',
    '/projects/[slug]',
  ],
}
