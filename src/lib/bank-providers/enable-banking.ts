/**
 * Enable Banking adapter — EU PSD2 (2,500+ banks, 29 countries).
 * OAuth 2.0 authorisation code flow (Berlin Group / NextGenPSD2).
 *
 * Docs: https://enablebanking.com/docs
 * Env vars required:
 *   ENABLE_BANKING_CLIENT_ID
 *   ENABLE_BANKING_CLIENT_SECRET
 *   ENABLE_BANKING_BASE_URL  (optional, defaults to production)
 */

import type {
  BankProviderAdapter,
  NormalizedTransaction,
  NormalizedAccount,
  NormalizedBalance,
  FetchTransactionsResult,
} from '@/types/bank-providers'

const DEFAULT_BASE_URL = 'https://api.enablebanking.com'

function getBaseUrl(): string {
  return process.env.ENABLE_BANKING_BASE_URL || DEFAULT_BASE_URL
}

// ── Raw Enable Banking API shapes ─────────────────────────────────────────────

interface EBAccount {
  resource_id: string
  currency: string
  name?: string
  product?: string
  cash_account_type?: string   // 'CACC' | 'SVGS' | 'CARD' | ...
  iban?: string
  bban?: string
}

interface EBBalance {
  balance_amount: { amount: string; currency: string }
  balance_type: string         // 'closingBooked' | 'interimAvailable' | ...
  credit_limit_included?: boolean
}

interface EBTransaction {
  transaction_id?: string
  entry_reference?: string
  booking_date?: string
  value_date?: string
  transaction_amount: { amount: string; currency: string }
  creditor_name?: string
  debtor_name?: string
  remittance_information_unstructured?: string
  bank_transaction_code?: string
  status?: string
}

interface EBTokenResponse {
  access?: string              // Enable Banking uses 'access' not 'access_token'
  access_token?: string
  refresh?: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.ENABLE_BANKING_CLIENT_ID
  const clientSecret = process.env.ENABLE_BANKING_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('ENABLE_BANKING_CLIENT_ID and ENABLE_BANKING_CLIENT_SECRET are required')
  }
  return { clientId, clientSecret }
}

/**
 * Returns the OAuth authorisation URL to redirect the user to.
 * `aspspId` is the bank identifier (e.g. 'DE_DEUTDEDB').
 * `state` should be a CSRF-safe opaque value.
 */
export function buildEnableBankingAuthUrl(params: {
  aspspId: string
  redirectUri: string
  state: string
  daysRequested?: number      // How many days of history to request (default 90)
}): string {
  const { clientId } = getCredentials()
  const base = getBaseUrl()
  const url = new URL(`${base}/auth`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('state', params.state)
  url.searchParams.set('aspsp_id', params.aspspId)
  url.searchParams.set('scope', 'accounts balances transactions')
  if (params.daysRequested) {
    url.searchParams.set('max_historical_days', String(params.daysRequested))
  }
  return url.toString()
}

/**
 * Exchanges an authorisation code for access + refresh tokens.
 */
export async function exchangeEnableBankingCode(params: {
  code: string
  redirectUri: string
}): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: Date }> {
  const { clientId, clientSecret } = getCredentials()
  const base = getBaseUrl()
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  })
  const res = await fetch(`${base}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Enable Banking token exchange failed ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = (await res.json()) as EBTokenResponse
  // Enable Banking may use 'access' or 'access_token'
  const accessToken = data.access ?? data.access_token ?? ''
  const refreshToken = data.refresh ?? data.refresh_token ?? null
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000)
  return { accessToken, refreshToken, expiresAt }
}

/**
 * Refreshes an expired access token.
 */
export async function refreshEnableBankingToken(refreshToken: string): Promise<{
  accessToken: string
  refreshToken: string | null
  expiresAt: Date
}> {
  const { clientId, clientSecret } = getCredentials()
  const base = getBaseUrl()
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })
  const res = await fetch(`${base}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    if (res.status === 401 || res.status === 400) throw new Error('AUTH_FAILED')
    throw new Error(`Enable Banking token refresh failed ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = (await res.json()) as EBTokenResponse
  const accessToken = data.access ?? data.access_token ?? ''
  const newRefresh = data.refresh ?? data.refresh_token ?? null
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000)
  return { accessToken, refreshToken: newRefresh, expiresAt }
}

// ── API fetch helper ──────────────────────────────────────────────────────────

async function ebFetch<T>(path: string, accessToken: string): Promise<T> {
  const base = getBaseUrl()
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    if (res.status === 401 || res.status === 403) throw new Error('AUTH_FAILED')
    if (res.status === 429) throw new Error('RATE_LIMITED')
    throw new Error(`Enable Banking API error ${res.status}: ${text.slice(0, 100)}`)
  }
  return res.json() as Promise<T>
}

function mapAccountType(cashType?: string): 'checking' | 'savings' | 'credit' | 'other' {
  if (!cashType) return 'other'
  const t = cashType.toUpperCase()
  if (t === 'CACC' || t === 'TRAN') return 'checking'
  if (t === 'SVGS') return 'savings'
  if (t === 'CARD' || t === 'CRDT') return 'credit'
  return 'other'
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class EnableBankingAdapter implements BankProviderAdapter {
  async fetchAccounts(accessToken: string): Promise<NormalizedAccount[]> {
    const data = await ebFetch<{ accounts: EBAccount[] }>(
      '/v2/accounts',
      accessToken
    )
    return data.accounts.map(a => {
      const ident = a.iban ?? a.bban ?? ''
      return {
        externalId: a.resource_id,
        name: a.name ?? a.product ?? a.cash_account_type ?? 'Account',
        type: mapAccountType(a.cash_account_type),
        currency: a.currency,
        lastFour: ident.slice(-4) || undefined,
      }
    })
  }

  async fetchBalance(accessToken: string, externalAccountId: string): Promise<NormalizedBalance> {
    const data = await ebFetch<{ balances: EBBalance[] }>(
      `/v2/accounts/${externalAccountId}/balances`,
      accessToken
    )
    const balances = data.balances ?? []

    const avail = balances.find(b =>
      b.balance_type === 'interimAvailable' || b.balance_type === 'expected'
    )
    const booked = balances.find(b =>
      b.balance_type === 'closingBooked' || b.balance_type === 'interimBooked'
    ) ?? balances[0]

    return {
      available: avail ? parseFloat(avail.balance_amount.amount) : null,
      current: booked ? parseFloat(booked.balance_amount.amount) : 0,
      currency: (booked ?? avail)?.balance_amount.currency ?? 'EUR',
    }
  }

  async fetchTransactions(
    accessToken: string,
    externalAccountId: string,
    opts?: { startDate?: string; endDate?: string }
  ): Promise<FetchTransactionsResult> {
    const params = new URLSearchParams()
    if (opts?.startDate) params.set('date_from', opts.startDate)
    if (opts?.endDate) params.set('date_to', opts.endDate)
    const qs = params.toString()
    const path = `/v2/accounts/${externalAccountId}/transactions${qs ? `?${qs}` : ''}`

    const data = await ebFetch<{
      transactions: { booked?: EBTransaction[]; pending?: EBTransaction[] }
    }>(path, accessToken)

    const booked = (data.transactions?.booked ?? []).map(t => ({ t, status: 'posted' as const }))
    const pending = (data.transactions?.pending ?? []).map(t => ({ t, status: 'pending' as const }))

    const normalized: NormalizedTransaction[] = [...booked, ...pending].map(({ t, status }) => {
      const amount = parseFloat(t.transaction_amount.amount)
      const counterpartyName = amount >= 0 ? t.debtor_name : t.creditor_name
      return {
        externalId: t.transaction_id ?? t.entry_reference ?? `${t.booking_date}-${amount}`,
        date: (t.booking_date ?? t.value_date ?? new Date().toISOString()).split('T')[0],
        amount,
        description: t.remittance_information_unstructured ?? counterpartyName ?? '',
        counterpartyName,
        category: t.bank_transaction_code,
        status,
        runningBalance: null,
        rawData: t as unknown as Record<string, unknown>,
      }
    })

    return { transactions: normalized, hasMore: false }
  }

  async testConnection(accessToken: string): Promise<boolean> {
    try {
      await ebFetch('/v2/accounts', accessToken)
      return true
    } catch {
      return false
    }
  }
}
