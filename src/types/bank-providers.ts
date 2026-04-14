// ── Provider adapter interface ────────────────────────────────────────────────

export interface NormalizedTransaction {
  externalId: string           // Provider transaction ID
  date: string                 // ISO 8601 date string (YYYY-MM-DD)
  amount: number               // Signed: negative = expense, positive = income
  description: string          // Raw description from bank
  category?: string            // Provider's category label (if available)
  counterpartyName?: string    // Enriched payee/merchant name
  status: 'posted' | 'pending'
  runningBalance?: number | null
  rawData: Record<string, unknown>
}

export interface NormalizedAccount {
  externalId: string
  name: string
  type: 'checking' | 'savings' | 'credit' | 'other'
  currency: string
  lastFour?: string
  institutionName?: string
  institutionId?: string
}

export interface NormalizedBalance {
  available: number | null
  current: number
  currency: string
}

export interface FetchTransactionsResult {
  transactions: NormalizedTransaction[]
  cursor?: string
  hasMore: boolean
}

export interface BankProviderAdapter {
  /** List accounts accessible via this connection */
  fetchAccounts(accessToken: string): Promise<NormalizedAccount[]>

  /** Fetch live balance for one account */
  fetchBalance(accessToken: string, externalAccountId: string): Promise<NormalizedBalance>

  /** Fetch transactions, optionally using cursor or date range for incremental sync */
  fetchTransactions(
    accessToken: string,
    externalAccountId: string,
    opts?: {
      cursor?: string
      startDate?: string   // YYYY-MM-DD
      endDate?: string     // YYYY-MM-DD
      count?: number
    }
  ): Promise<FetchTransactionsResult>

  /** Test if the connection is still valid */
  testConnection(accessToken: string): Promise<boolean>
}

// ── Plaid-specific types ──────────────────────────────────────────────────────

export interface PlaidSyncResponse {
  added: PlaidTransaction[]
  modified: PlaidTransaction[]
  removed: { transaction_id: string }[]
  next_cursor: string
  has_more: boolean
}

export interface PlaidTransaction {
  transaction_id: string
  account_id: string
  date: string
  amount: number           // Positive = expense in Plaid (inverted from our convention)
  name: string
  merchant_name: string | null
  pending: boolean
  personal_finance_category?: {
    primary: string
    detailed: string
  } | null
}

// ── Connection init response ──────────────────────────────────────────────────

export interface ConnectionInitResponse {
  provider: 'PLAID' | 'ENABLE_BANKING' | 'BROWSER_AGENT'
  // Plaid: client loads PlaidLink with this
  plaidLinkToken?: string
  // Enable Banking: client redirects to this URL
  oauthUrl?: string
}

// ── Webhook payloads ──────────────────────────────────────────────────────────

export interface PlaidWebhookPayload {
  webhook_type: string          // 'TRANSACTIONS' | 'ITEM'
  webhook_code: string          // 'SYNC_UPDATES_AVAILABLE' | 'ERROR' | etc.
  item_id: string
  error?: { error_code: string; error_message: string } | null
  initial_update_complete?: boolean
  historical_update_complete?: boolean
}

export interface EnableBankingWebhookPayload {
  notification_id: string
  event_type: string            // 'session.expired' | 'transactions.available' | etc.
  session_id: string
  aspsp_id?: string
  timestamp: string
  data?: Record<string, unknown>
}
