import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/transactions',
  title: 'Transactions',
  purpose: 'Browse, search, edit, categorise, and bulk-delete bank transactions.',
  jobsToBeDone: [
    'Search transactions by description, payee, category, or date',
    'Edit a transaction\'s category, payee, project, or notes',
    'Bulk delete duplicate or unwanted transactions',
    'Create a categorisation rule from an edited row',
    'Filter by account or project',
  ],
  deepLinks: {},
  reads: ['Transaction', 'Category', 'Payee', 'Project', 'CategorizationRule'],
  writes: ['Transaction', 'CategorizationRule'],
  relatedRoutes: ['/upload', '/rules', '/accounts'],
}
