'use client'

import { useEffect, useState } from 'react'
import { NewAccountForm, type Account } from './new-account-form'

export function AccountRail({
  accounts,
  loadingAccounts,
  accountId,
  preselectedFromProfile,
  onAccountIdChange,
  onAccountCreated,
}: {
  accounts: Account[]
  loadingAccounts: boolean
  accountId: string | null
  preselectedFromProfile: boolean
  onAccountIdChange: (id: string) => void
  onAccountCreated?: (account: Account) => void
}) {
  const [showNewAccount, setShowNewAccount] = useState(false)

  useEffect(() => {
    if (!loadingAccounts && accounts.length === 1 && !accountId) onAccountIdChange(accounts[0].id)
  }, [accounts, loadingAccounts, accountId, onAccountIdChange])

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-foreground">Account</p>
        {!showNewAccount && (
          <button
            type="button"
            onClick={() => setShowNewAccount(true)}
            className="text-xs text-primary hover:underline"
          >
            + New account
          </button>
        )}
      </div>

      {showNewAccount ? (
        <NewAccountForm
          onCreated={(account) => {
            onAccountCreated?.(account)
            onAccountIdChange(account.id)
            setShowNewAccount(false)
          }}
          onCancel={() => setShowNewAccount(false)}
        />
      ) : loadingAccounts ? (
        <p className="text-xs text-muted-foreground">Loading accounts…</p>
      ) : accounts.length === 0 ? (
        <div>
          <p className="text-xs text-muted-foreground mb-1">No accounts yet.</p>
          <button
            type="button"
            onClick={() => setShowNewAccount(true)}
            className="text-xs text-primary hover:underline"
          >
            Create your first account →
          </button>
        </div>
      ) : (
        <>
        <select
          value={accountId ?? ''}
          onChange={(e) => onAccountIdChange(e.target.value || '')}
          className={`w-full rounded-md border px-3 py-1.5 text-sm${!accountId ? ' account-throb' : ''}`}
          data-testid="account-select"
        >
          <option value="">— select account —</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.institution.name} · {a.currency}
            </option>
          ))}
        </select>
        {preselectedFromProfile && (
          <p className="mt-1 text-[10px] text-muted-foreground">Pre-selected from your last import of this file format.</p>
        )}
        </>
      )}

      {!accountId && !showNewAccount && (
        <p className="text-[10px] text-amber-600 mt-1">Select an account to enable preview and import</p>
      )}
    </div>
  )
}
