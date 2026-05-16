import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/accounts',
  title: 'Accounts',
  purpose: 'Manage bank and financial accounts — view balances, types, and transaction counts.',
  jobsToBeDone: [
    'See all accounts with current balances and transaction counts',
    'Add a new manual account',
    'View what currency each account uses',
  ],
  deepLinks: {},
  reads: ['Account', 'Transaction'],
  writes: ['Account'],
  relatedRoutes: ['/transactions', '/connections', '/bank-sync'],
}
