import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/projects/[slug]/financials',
  title: 'Project financials',
  purpose: 'Financial summary for a single project — transactions, receipts, income vs. expenses, and categorisation.',
  jobsToBeDone: [
    'See all transactions attributed to this project',
    'View income and expense totals for the project',
    'Categorise or re-categorise project transactions',
    'See receipts linked to project expenses',
    'Filter by date range or category',
  ],
  deepLinks: {},
  reads: ['Transaction', 'Receipt', 'CategoryGroup', 'Category', 'Payee'],
  writes: ['Transaction'],
  relatedRoutes: [
    '/transactions',
    '/receipts',
    '/projects/[slug]',
  ],
}
