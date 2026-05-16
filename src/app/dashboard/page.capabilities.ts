import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/dashboard',
  title: 'Dashboard',
  purpose: 'Overview of finances — KPIs, cashflow chart, net worth, and expenses by category.',
  jobsToBeDone: [
    'See income, expenses, and net balance at a glance',
    'Chart cashflow over a custom date range',
    'Track net worth across all accounts',
    'See top expense categories for a period',
    'Switch the display currency',
  ],
  deepLinks: {},
  reads: ['Transaction', 'Account', 'Category', 'CategoryGroup', 'FxRate'],
  writes: [],
  relatedRoutes: ['/transactions', '/pivot', '/accounts'],
}
