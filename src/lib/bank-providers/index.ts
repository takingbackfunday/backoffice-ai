import type { BankProviderAdapter } from '@/types/bank-providers'
import { TellerAdapter } from './teller'
import { PlaidAdapter } from './plaid'
import { BrowserAgentAdapter } from './browser-agent'

export type ProviderType = 'TELLER' | 'PLAID' | 'BROWSER_AGENT'

export function getAdapter(provider: ProviderType): BankProviderAdapter {
  switch (provider) {
    case 'TELLER': return new TellerAdapter()
    case 'PLAID': return new PlaidAdapter()
    case 'BROWSER_AGENT': return new BrowserAgentAdapter()
  }
}

export { PlaidAdapter } from './plaid'
export { TellerAdapter } from './teller'
