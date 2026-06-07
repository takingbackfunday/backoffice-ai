import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/bank-accounts',
  title: 'Bank accounts',
  purpose: 'View and manage all bank accounts and cards — manual sync via browser agent.',
  jobsToBeDone: [
    'See all bank accounts and cards',
    'Add a new bank account manually',
    'Connect a bank account via browser automation (manual sync)',
  ],
  deepLinks: {},
  reads: ['Account', 'Institution'],
  writes: ['Account'],
  relatedRoutes: [
    '/accounts/new',
    '/bank-sync',
    '/transactions',
  ],
}
