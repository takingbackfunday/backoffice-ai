'use client'

import { useState } from 'react'
import { ConnectBankDialog } from './connect-bank-dialog'
import { ConnectionStatus } from './connection-status'

interface AccountData {
  id: string
  name: string
  type: string
  institution: { name: string }
  bankConnection: {
    id: string
    provider: 'TELLER' | 'PLAID' | 'BROWSER_AGENT'
    status: 'ACTIVE' | 'DISCONNECTED' | 'DEGRADED' | 'REVOKED'
    lastSyncAt: string | null
    disconnectReason: string | null
  } | null
  hasBankPlaybook: boolean
}

export function ConnectionsClient({ accounts }: { accounts: AccountData[] }) {
  const [connectingAccountId, setConnectingAccountId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [accountStates, setAccountStates] = useState<Record<string, AccountData['bankConnection']>>(() => {
    const init: Record<string, AccountData['bankConnection']> = {}
    for (const a of accounts) init[a.id] = a.bankConnection
    return init
  })
  const [toast, setToast] = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  async function handleSync(connectionId: string, accountId: string) {
    setSyncing(connectionId)
    try {
      const res = await fetch(`/api/connections/${connectionId}/sync`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || json.error) {
        showToast(json.error || 'Sync failed')
      } else {
        showToast(`Synced: ${json.data.imported} imported, ${json.data.skipped} skipped`)
        setAccountStates(prev => ({
          ...prev,
          [accountId]: prev[accountId] ? { ...prev[accountId]!, lastSyncAt: new Date().toISOString() } : null,
        }))
      }
    } catch {
      showToast('Network error during sync')
    } finally {
      setSyncing(null)
    }
  }

  async function handleDisconnect(connectionId: string, accountId: string) {
    if (!confirm('Disconnect this bank connection? Existing transactions will not be deleted.')) return
    try {
      const res = await fetch(`/api/connections/${connectionId}`, { method: 'DELETE' })
      if (!res.ok) {
        showToast('Failed to disconnect')
        return
      }
      setAccountStates(prev => ({ ...prev, [accountId]: null }))
      showToast('Connection removed')
    } catch {
      showToast('Network error')
    }
  }

  async function handleReauth(connectionId: string) {
    try {
      const res = await fetch(`/api/connections/${connectionId}/reauth`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || json.error) {
        showToast(json.error || 'Re-auth failed')
        return
      }
      // For now, just show a message — the Teller/Plaid widgets need the returned data
      showToast('Re-auth initiated. Reconnect via the Connect button.')
    } catch {
      showToast('Network error')
    }
  }

  return (
    <div className="max-w-3xl">
      {toast && (
        <div className="mb-4 rounded-lg bg-foreground text-background px-4 py-2 text-sm">
          {toast}
        </div>
      )}

      <p className="text-sm text-muted-foreground mb-6">
        Connect bank accounts to automatically sync transactions via Teller or Plaid.
      </p>

      <div className="flex flex-col gap-4">
        {accounts.map(account => {
          const conn = accountStates[account.id]
          const isConnecting = connectingAccountId === account.id
          const isSyncing = conn ? syncing === conn.id : false

          return (
            <div key={account.id} className="rounded-lg border bg-background p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-sm">{account.name}</p>
                  <p className="text-xs text-muted-foreground">{account.institution.name} · {account.type.replace(/_/g, ' ')}</p>
                </div>

                {!conn && !isConnecting && (
                  <button
                    onClick={() => setConnectingAccountId(account.id)}
                    className="shrink-0 text-xs px-3 py-1.5 rounded-md bg-foreground text-background hover:opacity-90 transition-opacity"
                  >
                    Connect
                  </button>
                )}
              </div>

              {isConnecting && (
                <div className="mt-3 pt-3 border-t">
                  <ConnectBankDialog
                    accountId={account.id}
                    onConnected={(result) => {
                      setConnectingAccountId(null)
                      setAccountStates(prev => ({
                        ...prev,
                        [account.id]: {
                          id: result.connectionId,
                          provider: 'TELLER',
                          status: 'ACTIVE',
                          lastSyncAt: new Date().toISOString(),
                          disconnectReason: null,
                        },
                      }))
                      showToast(`Connected! ${result.imported} transactions imported.`)
                    }}
                    onCancel={() => setConnectingAccountId(null)}
                  />
                </div>
              )}

              {conn && (
                <div className="mt-3 pt-3 border-t">
                  {isSyncing ? (
                    <span className="text-xs text-muted-foreground">Syncing…</span>
                  ) : (
                    <ConnectionStatus
                      status={conn.status}
                      provider={conn.provider}
                      lastSyncAt={conn.lastSyncAt}
                      disconnectReason={conn.disconnectReason}
                      connectionId={conn.id}
                      onSync={() => handleSync(conn.id, account.id)}
                      onReauth={() => handleReauth(conn.id)}
                      onDisconnect={() => handleDisconnect(conn.id, account.id)}
                    />
                  )}
                </div>
              )}

              {!conn && account.hasBankPlaybook && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Legacy browser sync active.{' '}
                  <a href="/bank-sync" className="underline">Manage →</a>
                </p>
              )}
            </div>
          )
        })}

        {accounts.length === 0 && (
          <div className="rounded-lg border bg-background p-8 text-center">
            <p className="text-sm text-muted-foreground mb-2">No accounts found.</p>
            <a href="/accounts?onboarding=1" className="text-sm text-blue-600 underline">Add an account first →</a>
          </div>
        )}
      </div>
    </div>
  )
}
