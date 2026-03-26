import type {
  BankProviderAdapter,
  NormalizedAccount,
  NormalizedBalance,
  FetchTransactionsResult,
} from '@/types/bank-providers'

/**
 * Wrapper around the existing browser automation agent.
 * This adapter does NOT support incremental sync — each call does a full CSV download.
 * It exists only to satisfy the BankProviderAdapter interface for the legacy path.
 */
export class BrowserAgentAdapter implements BankProviderAdapter {
  async fetchAccounts(): Promise<NormalizedAccount[]> {
    throw new Error('BrowserAgent does not support fetchAccounts. Use the bank-agent/connect flow instead.')
  }

  async fetchBalance(): Promise<NormalizedBalance> {
    throw new Error('BrowserAgent does not support fetchBalance.')
  }

  async fetchTransactions(): Promise<FetchTransactionsResult> {
    throw new Error('BrowserAgent sync is handled via /api/bank-agent/sync, not via the adapter.')
  }

  async testConnection(): Promise<boolean> {
    return false
  }
}
