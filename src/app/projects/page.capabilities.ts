import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects',
  title: 'Projects',
  purpose: 'List all workspaces — CLIENT (freelance), PROPERTY, and OTHER — with creation shortcuts.',
  jobsToBeDone: [
    'See all projects and their type (client, property, other)',
    'Create a new client, property, or other project',
    'Create a new work order or intake a subcontractor bill',
    'Navigate to a specific project\'s detail page',
  ],
  deepLinks: {},
  reads: ['Project', 'ClientProfile', 'Unit'],
  writes: ['Project', 'WorkOrder', 'Bill'],
  relatedRoutes: ['/studio', '/portfolio'],
}
