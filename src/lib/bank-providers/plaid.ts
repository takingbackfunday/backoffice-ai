import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid'
import type {
  BankProviderAdapter,
  NormalizedTransaction,
  NormalizedAccount,
  NormalizedBalance,
  FetchTransactionsResult,
} from '@/types/bank-providers'

function getPlaidClient(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID
  const secret = process.env.PLAID_SECRET
  const env = process.env.PLAID_ENV || 'sandbox'

  if (!clientId || !secret) {
    throw new Error('PLAID_CLIENT_ID and PLAID_SECRET are required')
  }

  const config = new Configuration({
    basePath: PlaidEnvironments[env as keyof typeof PlaidEnvironments] || PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  })

  return new PlaidApi(config)
}

function mapPlaidAccountType(type: string, subtype: string | null): 'checking' | 'savings' | 'credit' | 'other' {
  if (type === 'credit') return 'credit'
  if (subtype === 'checking') return 'checking'
  if (subtype === 'savings') return 'savings'
  return 'other'
}

export class PlaidAdapter implements BankProviderAdapter {
  private _client: PlaidApi | null = null
  private get client(): PlaidApi {
    if (!this._client) this._client = getPlaidClient()
    return this._client
  }

  async fetchAccounts(accessToken: string): Promise<NormalizedAccount[]> {
    const response = await this.client.accountsGet({ access_token: accessToken })
    const item = response.data.item
    return response.data.accounts.map(a => ({
      externalId: a.account_id,
      name: a.name,
      type: mapPlaidAccountType(a.type ?? 'other', a.subtype ?? null),
      currency: a.balances.iso_currency_code || 'USD',
      lastFour: a.mask ?? undefined,
      institutionId: item.institution_id ?? undefined,
    }))
  }

  async fetchBalance(accessToken: string, externalAccountId: string): Promise<NormalizedBalance> {
    const response = await this.client.accountsBalanceGet({
      access_token: accessToken,
      options: { account_ids: [externalAccountId] },
    })
    const acct = response.data.accounts[0]
    if (!acct) throw new Error('Account not found in Plaid response')
    return {
      available: acct.balances.available,
      current: acct.balances.current ?? 0,
      currency: acct.balances.iso_currency_code || 'USD',
    }
  }

  async fetchTransactions(
    accessToken: string,
    _externalAccountId: string,
    opts?: { cursor?: string; count?: number }
  ): Promise<FetchTransactionsResult> {
    const response = await this.client.transactionsSync({
      access_token: accessToken,
      cursor: opts?.cursor || '',
      count: opts?.count || 500,
    })

    const { added, modified, next_cursor, has_more } = response.data

    const allTxns = [...added, ...modified]

    const normalized: NormalizedTransaction[] = allTxns.map(t => ({
      externalId: t.transaction_id,
      date: t.date,
      // CRITICAL: Plaid amounts are INVERTED from our convention.
      amount: -t.amount,
      description: t.name,
      category: t.personal_finance_category?.primary ?? undefined,
      counterpartyName: t.merchant_name ?? undefined,
      status: t.pending ? 'pending' : 'posted',
      runningBalance: null,
      rawData: t as unknown as Record<string, unknown>,
    }))

    return {
      transactions: normalized,
      cursor: next_cursor,
      hasMore: has_more,
    }
  }

  async testConnection(accessToken: string): Promise<boolean> {
    try {
      await this.client.accountsGet({ access_token: accessToken })
      return true
    } catch {
      return false
    }
  }

  async createLinkToken(userId: string, webhookUrl: string): Promise<string> {
    const response = await this.client.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: 'Backoffice AI',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
      webhook: webhookUrl,
      transactions: {
        days_requested: 90,
      },
    })
    return response.data.link_token
  }

  async createUpdateLinkToken(userId: string, accessToken: string): Promise<string> {
    const response = await this.client.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: 'Backoffice AI',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
      access_token: accessToken,
    })
    return response.data.link_token
  }

  async exchangePublicToken(publicToken: string): Promise<{ accessToken: string; itemId: string }> {
    const response = await this.client.itemPublicTokenExchange({
      public_token: publicToken,
    })
    return {
      accessToken: response.data.access_token,
      itemId: response.data.item_id,
    }
  }

  async searchInstitution(query: string): Promise<{ id: string; name: string } | null> {
    try {
      const response = await this.client.institutionsSearch({
        query,
        products: [Products.Transactions],
        country_codes: [CountryCode.Us],
      })
      const inst = response.data.institutions[0]
      return inst ? { id: inst.institution_id, name: inst.name } : null
    } catch {
      return null
    }
  }
}
