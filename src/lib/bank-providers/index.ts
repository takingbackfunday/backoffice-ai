import type { BankProviderAdapter } from '@/types/bank-providers'
import { PlaidAdapter } from './plaid'
import { EnableBankingAdapter } from './enable-banking'
import { BrowserAgentAdapter } from './browser-agent'

export type ProviderType = 'PLAID' | 'ENABLE_BANKING' | 'BROWSER_AGENT'

export function getAdapter(provider: ProviderType): BankProviderAdapter {
  switch (provider) {
    case 'PLAID': return new PlaidAdapter()
    case 'ENABLE_BANKING': return new EnableBankingAdapter()
    case 'BROWSER_AGENT': return new BrowserAgentAdapter()
  }
}

export { PlaidAdapter } from './plaid'
export { EnableBankingAdapter } from './enable-banking'
