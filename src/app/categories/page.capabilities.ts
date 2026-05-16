import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/categories',
  title: 'Categories',
  purpose: 'Manage transaction category groups and categories — add, rename, reorder, and mark categories as non-deductible.',
  jobsToBeDone: [
    'Add a new category or category group',
    'Rename or delete an existing category',
    'Reorder categories within a group',
    'Mark a category as non-deductible (excluded from tax reports)',
    'Reset categories to defaults for a specific business type',
    'See how many transactions are tagged to each category',
  ],
  deepLinks: {},
  reads: ['CategoryGroup', 'Category', 'UserPreference'],
  writes: ['CategoryGroup', 'Category', 'UserPreference'],
  relatedRoutes: [
    '/transactions',
    '/rules',
    '/settings',
  ],
}
