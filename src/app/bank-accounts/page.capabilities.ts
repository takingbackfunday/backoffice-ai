import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/bank-accounts',
  title: 'Bank accounts',
  purpose: 'View and manage all connected and manually added bank accounts — sync status, balances, and connection health.',
  jobsToBeDone: [
    'See all bank accounts and their current balance',
    'Check the sync status of each connected account',
    'Add a new bank account manually',
    'Connect a bank account via open banking (Plaid, Finexer, Enable Banking)',
    'Reconnect a disconnected bank account',
    'Refresh transactions for a connected account',
  ],
  deepLinks: {},
  reads: ['Account', 'Institution', 'BankConnection'],
  writes: ['Account', 'BankConnection'],
  relatedRoutes: [
    '/accounts/new',
    '/bank-sync',
    '/transactions',
  ],
}
