import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/bank-sync',
  title: 'Bank sync',
  purpose: 'Manually trigger a sync for connected bank accounts to pull in the latest transactions.',
  jobsToBeDone: [
    'Trigger a manual sync for a connected bank account',
    'See when the last sync ran and how many transactions were imported',
    'Check the status of a running sync job',
  ],
  deepLinks: {},
  reads: ['SyncJob', 'Account'],
  writes: ['Transaction', 'SyncJob'],
  relatedRoutes: ['/connections', '/transactions', '/accounts'],
}
