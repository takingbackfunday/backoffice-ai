import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/payees',
  title: 'Payees',
  purpose: 'Manage payees — assign default categories to vendors, merchants, and income sources.',
  jobsToBeDone: [
    'See all payees with their default categories and transaction counts',
    'Assign or change a payee\'s default category',
    'Search payees by name',
    'Delete unused payees',
  ],
  deepLinks: {},
  reads: ['Payee', 'Category'],
  writes: ['Payee'],
  relatedRoutes: ['/rules', '/transactions'],
}
