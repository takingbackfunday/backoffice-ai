// ── Provider adapter interface ────────────────────────────────────────────────

export interface NormalizedTransaction {
  externalId: string           // Teller txn_xxx or Plaid transaction_id
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

  /** Fetch transactions, optionally using cursor for incremental sync */
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

// ── Teller-specific types ─────────────────────────────────────────────────────

export interface TellerAccount {
  id: string
  enrollment_id: string
  name: string
  type: 'depository' | 'credit'
  subtype: string
  currency: string
  last_four: string
  status: 'open' | 'closed'
  institution: { id: string; name: string }
  links: {
    self: string
    balances?: string
    transactions?: string
    details?: string
  }
}

export interface TellerTransaction {
  id: string
  account_id: string
  date: string
  description: string
  amount: string        // String, signed
  status: 'posted' | 'pending'
  type: string
  running_balance: string | null
  details: {
    processing_status: 'complete' | 'pending'
    category: string | null
    counterparty: {
      name: string | null
      type: 'organization' | 'person' | null
    }
  }
  links: { self: string; account: string }
}

export interface TellerBalance {
  account_id: string
  available: string
  ledger: string
  links: { self: string; account: string }
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
  provider: 'TELLER' | 'PLAID' | 'BROWSER_AGENT'
  // Teller: client loads TellerConnect with these
  tellerAppId?: string
  tellerEnvironment?: string
  // Plaid: client loads PlaidLink with this
  plaidLinkToken?: string
}

// ── Webhook payloads ──────────────────────────────────────────────────────────

export interface TellerWebhookPayload {
  id: string
  type: 'enrollment.disconnected' | 'transactions.processed' | 'webhook.test'
  timestamp: string
  payload: {
    enrollment_id?: string
    reason?: string
    transactions?: TellerTransaction[]
  }
}

export interface PlaidWebhookPayload {
  webhook_type: string          // 'TRANSACTIONS' | 'ITEM'
  webhook_code: string          // 'SYNC_UPDATES_AVAILABLE' | 'ERROR' | etc.
  item_id: string
  error?: { error_code: string; error_message: string } | null
  initial_update_complete?: boolean
  historical_update_complete?: boolean
}
