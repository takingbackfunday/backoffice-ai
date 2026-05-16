import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/pivot',
  title: 'Pivot table',
  purpose: 'Flexible pivot table for slicing and aggregating transaction data by any dimension.',
  jobsToBeDone: [
    'Group transactions by category, account, project, payee, or time period',
    'Compare income and expenses across different dimensions',
    'Toggle subtotals, grand totals, and decimal display',
    'Export pivot data to CSV',
    'Save and load named pivot presets',
  ],
  deepLinks: {},
  reads: ['Transaction', 'Category', 'Account', 'Payee'],
  writes: [],
  relatedRoutes: ['/transactions', '/dashboard'],
}
