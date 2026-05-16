import type { PageCapability } from '@/lib/agent/site-capabilities-types'

export const capability: PageCapability = {
  route: '/accounts/new',
  title: 'Add account',
  purpose: 'Manually add a new bank or financial account — set type, currency, country, and opening balance.',
  jobsToBeDone: [
    'Add a checking, savings, business, or credit card account manually',
    'Set the account currency and country',
    'Set an opening balance',
    'Link the account to an existing bank connection',
  ],
  deepLinks: {},
  reads: [],
  writes: ['Account', 'Institution'],
  relatedRoutes: [
    '/accounts',
    '/bank-sync',
  ],
}
