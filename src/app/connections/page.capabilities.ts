import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/connections',
  title: 'Bank connections',
  purpose: 'Connect bank accounts for automatic transaction sync via Plaid (US), Finexer (UK), or Enable Banking (EU).',
  jobsToBeDone: [
    'Connect a US bank account via Plaid',
    'Connect a UK bank account via Finexer',
    'Connect a European bank account via Enable Banking (29 countries)',
    'Disconnect or refresh an existing bank connection',
    'View connection status and last sync time',
  ],
  deepLinks: {},
  reads: ['Account', 'SyncJob'],
  writes: ['Account', 'EncryptedCredential'],
  relatedRoutes: ['/bank-sync', '/accounts', '/transactions'],
}
