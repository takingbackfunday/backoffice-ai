import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/bank-accounts',
  title: 'Bank accounts',
  purpose: 'View and manage bank accounts and cards, fetch transactions from supported banks, and manage remembered bank-browser data.',
  jobsToBeDone: [
    'See all bank accounts and cards',
    'Add a new bank account manually',
    'Fetch the latest transactions from a supported Chase or N26 account',
    'Forget the trusted-device browser profile or learned export route',
  ],
  deepLinks: {},
  reads: ['Account', 'Institution'],
  writes: ['Account'],
  relatedRoutes: [
    '/accounts/new',
    '/transactions',
  ],
}
