import https from 'node:https'
import type {
  BankProviderAdapter,
  NormalizedTransaction,
  NormalizedAccount,
  NormalizedBalance,
  FetchTransactionsResult,
  TellerAccount,
  TellerTransaction,
  TellerBalance,
} from '@/types/bank-providers'

function getTellerAgent(): https.Agent {
  const cert = process.env.TELLER_CERT
  const key = process.env.TELLER_KEY
  if (!cert || !key) {
    throw new Error('TELLER_CERT and TELLER_KEY environment variables are required')
  }
  return new https.Agent({
    cert: Buffer.from(cert, 'base64').toString('utf-8'),
    key: Buffer.from(key, 'base64').toString('utf-8'),
  })
}

async function tellerFetch<T>(path: string, accessToken: string): Promise<T> {
  const env = process.env.TELLER_ENVIRONMENT || 'sandbox'
  const agent = env === 'sandbox' ? undefined : getTellerAgent()

  const url = `https://api.teller.io${path}`
  const headers: Record<string, string> = {
    'Authorization': `Basic ${Buffer.from(`${accessToken}:`).toString('base64')}`,
  }

  const fetchOptions: RequestInit & { agent?: https.Agent } = { headers }
  if (agent) {
    fetchOptions.agent = agent
  }

  const response = await fetch(url, fetchOptions as RequestInit)

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    console.error(`[teller] ${response.status} ${path}:`, errorText.slice(0, 200))

    if (response.status === 429) throw new Error('RATE_LIMITED')
    if (response.status === 401 || response.status === 403) throw new Error('AUTH_FAILED')
    throw new Error(`Teller API error ${response.status}: ${errorText.slice(0, 100)}`)
  }

  return response.json() as Promise<T>
}

function mapTellerAccountType(type: string, subtype: string): 'checking' | 'savings' | 'credit' | 'other' {
  if (type === 'credit') return 'credit'
  if (subtype === 'checking') return 'checking'
  if (subtype === 'savings') return 'savings'
  return 'other'
}

export class TellerAdapter implements BankProviderAdapter {
  async fetchAccounts(accessToken: string): Promise<NormalizedAccount[]> {
    const accounts = await tellerFetch<TellerAccount[]>('/accounts', accessToken)
    return accounts
      .filter(a => a.status === 'open')
      .map(a => ({
        externalId: a.id,
        name: a.name,
        type: mapTellerAccountType(a.type, a.subtype),
        currency: a.currency,
        lastFour: a.last_four,
        institutionName: a.institution.name,
        institutionId: a.institution.id,
      }))
  }

  async fetchBalance(accessToken: string, externalAccountId: string): Promise<NormalizedBalance> {
    const bal = await tellerFetch<TellerBalance>(
      `/accounts/${externalAccountId}/balances`,
      accessToken
    )
    return {
      available: bal.available ? parseFloat(bal.available) : null,
      current: parseFloat(bal.ledger),
      currency: 'USD',
    }
  }

  async fetchTransactions(
    accessToken: string,
    externalAccountId: string,
    opts?: { cursor?: string; startDate?: string; endDate?: string; count?: number }
  ): Promise<FetchTransactionsResult> {
    const params = new URLSearchParams()
    if (opts?.startDate) params.set('start_date', opts.startDate)
    if (opts?.endDate) params.set('end_date', opts.endDate)
    if (opts?.count) params.set('count', String(opts.count))
    if (opts?.cursor) params.set('from_id', opts.cursor)

    const qs = params.toString()
    const path = `/accounts/${externalAccountId}/transactions${qs ? `?${qs}` : ''}`
    const txns = await tellerFetch<TellerTransaction[]>(path, accessToken)

    const normalized: NormalizedTransaction[] = txns.map(t => ({
      externalId: t.id,
      date: t.date,
      amount: parseFloat(t.amount),
      description: t.description,
      category: t.details?.category ?? undefined,
      counterpartyName: t.details?.counterparty?.name ?? undefined,
      status: t.status,
      runningBalance: t.running_balance ? parseFloat(t.running_balance) : null,
      rawData: t as unknown as Record<string, unknown>,
    }))

    const lastId = txns.length > 0 ? txns[txns.length - 1].id : undefined

    return {
      transactions: normalized,
      cursor: lastId,
      hasMore: false,
    }
  }

  async testConnection(accessToken: string): Promise<boolean> {
    try {
      await tellerFetch<TellerAccount[]>('/accounts', accessToken)
      return true
    } catch {
      return false
    }
  }
}
