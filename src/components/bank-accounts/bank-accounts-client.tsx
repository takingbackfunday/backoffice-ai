'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { OnboardingBanner } from '@/components/onboarding/onboarding-banner'
import { ConnectBankDialog } from '@/components/connections/connect-bank-dialog'
import { ConnectionStatus } from '@/components/connections/connection-status'
import type { SyncJobEvent } from '@/types/bank-agent'
import { cn } from '@/lib/utils'

type Tab = 'accounts' | 'auto-sync' | 'manual-sync'

interface AccountData {
  id: string
  name: string
  type: string
  currency: string
  lastImportAt: string | null
  createdAt: string
  institution: { name: string }
  bankConnection: {
    id: string
    provider: 'PLAID' | 'ENABLE_BANKING' | 'BROWSER_AGENT'
    status: 'ACTIVE' | 'DISCONNECTED' | 'DEGRADED' | 'REVOKED'
    lastSyncAt: string | null
    disconnectReason: string | null
  } | null
  bankPlaybook: {
    id: string
    status: string
    lastVerifiedAt: string | null
    twoFaType: string
  } | null
}

interface Props {
  accounts: AccountData[]
  initialTab: Tab
  onboarding: boolean
}

// ── Accounts tab ─────────────────────────────────────────────────────────────

function AccountsTab({ accounts, onboarding }: { accounts: AccountData[]; onboarding: boolean }) {
  const router = useRouter()

  async function handleSkip() {
    await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboardingStep: 'done' }),
    })
    router.push('/transactions')
  }

  const addHref = onboarding ? '/accounts/new?onboarding=1' : '/accounts/new'

  return (
    <>
      {onboarding && (
        <OnboardingBanner
          step={2}
          message="Add your first bank account or credit card to start importing transactions."
          onSkip={handleSkip}
        />
      )}

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          Accounts are used to group transactions. Each account belongs to an institution.
        </p>
        <a
          href={addHref}
          className="shrink-0 rounded-md bg-[#3C3489] px-4 py-1.5 text-sm font-medium text-[#EEEDFE] hover:bg-[#2d2770] transition-colors"
          data-testid="add-account-btn"
        >
          + Add account
        </a>
      </div>

      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center">
          No accounts yet. Add one to start importing transactions.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="accounts-list">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded-lg border bg-background px-4 py-3">
              <div>
                <p className="text-sm font-medium">{a.name}</p>
                <p className="text-xs text-muted-foreground">
                  {a.institution.name} · {a.type.replace(/_/g, ' ')} · {a.currency}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {a.lastImportAt
                  ? `Last import: ${new Date(a.lastImportAt).toLocaleDateString()}`
                  : 'Never imported'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// ── Auto Sync tab ─────────────────────────────────────────────────────────────

function AutoSyncTab({ accounts }: { accounts: AccountData[] }) {
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
      if (!res.ok) { showToast('Failed to disconnect'); return }
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
      if (!res.ok || json.error) { showToast(json.error || 'Re-auth failed'); return }
      showToast('Re-auth initiated. Reconnect via the Connect button.')
    } catch {
      showToast('Network error')
    }
  }

  return (
    <>
      {toast && (
        <div className="mb-4 rounded-lg bg-foreground text-background px-4 py-2 text-sm">{toast}</div>
      )}

      <p className="text-sm text-muted-foreground mb-4">
        Connect accounts to automatically sync transactions via Teller (US) or Plaid (US + Europe).
      </p>

      <div className="flex flex-col gap-3">
        {accounts.map(account => {
          const conn = accountStates[account.id]
          const isConnecting = connectingAccountId === account.id
          const isSyncing = conn ? syncing === conn.id : false

          return (
            <div key={account.id} className="rounded-lg border bg-background p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{account.name}</p>
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
                          provider: result.provider as 'PLAID' | 'ENABLE_BANKING' | 'BROWSER_AGENT',
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

              {!conn && account.bankPlaybook && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Legacy browser sync active — manage it in the Manual Sync tab.
                </p>
              )}
            </div>
          )
        })}

        {accounts.length === 0 && (
          <div className="rounded-lg border bg-background p-8 text-center">
            <p className="text-sm text-muted-foreground mb-2">No accounts found.</p>
            <a href="/bank-accounts?tab=accounts&onboarding=1" className="text-sm text-blue-600 underline">Add an account first →</a>
          </div>
        )}
      </div>
    </>
  )
}

// ── Manual Sync tab ───────────────────────────────────────────────────────────

interface SyncJobStatus {
  id: string; status: string; triggeredBy: string; startedAt: string
  completedAt: string | null; error: string | null; imported: number | null; skipped: number | null
}
interface StatusData { isConnected: boolean; playbook: AccountData['bankPlaybook']; recentSyncs: SyncJobStatus[] }

function ManualSyncTab({ accounts }: { accounts: AccountData[] }) {
  const [connectingAccount, setConnectingAccount] = useState<string | null>(null)
  const [syncingAccount, setSyncingAccount] = useState<string | null>(null)
  const [disconnectingAccount, setDisconnectingAccount] = useState<string | null>(null)
  const [streamMessages, setStreamMessages] = useState<Record<string, string[]>>({})
  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  const [accountStatuses, setAccountStatuses] = useState<Record<string, StatusData>>({})
  const [connectionForms, setConnectionForms] = useState<Record<string, {
    loginUrl: string; username: string; password: string; showForm: boolean
  }>>({})

  function addMsg(accountId: string, msg: string) {
    setStreamMessages(prev => ({ ...prev, [accountId]: [...(prev[accountId] || []), msg] }))
  }
  function clearMsgs(accountId: string) {
    setStreamMessages(prev => ({ ...prev, [accountId]: [] }))
  }
  function updateForm(accountId: string, field: string, value: string) {
    setConnectionForms(prev => ({ ...prev, [accountId]: { ...prev[accountId], [field]: value } }))
  }
  function toggleForm(accountId: string) {
    setConnectionForms(prev => ({
      ...prev,
      [accountId]: {
        loginUrl: prev[accountId]?.loginUrl || '',
        username: prev[accountId]?.username || '',
        password: prev[accountId]?.password || '',
        showForm: !prev[accountId]?.showForm,
      },
    }))
  }

  async function loadStatus(accountId: string) {
    const res = await fetch(`/api/bank-agent/status?accountId=${accountId}`)
    if (res.ok) {
      const json = await res.json()
      setAccountStatuses(prev => ({ ...prev, [accountId]: json.data }))
    }
  }

  async function streamSSE(url: string, body: object, accountId: string, onComplete: () => void) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.body) { addMsg(accountId, '❌ No response stream'); return }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      for (const line of decoder.decode(value, { stream: true }).split('\n')) {
        if (!line.startsWith('data: ')) continue
        try {
          const event: SyncJobEvent = JSON.parse(line.slice(6))
          if (event.type === 'status') addMsg(accountId, event.message || '')
          else if (event.type === 'twofa_required') {
            addMsg(accountId, `🔒 ${event.message || ''}`)
            if (event.liveUrl) setLiveUrl(event.liveUrl)
          } else if (event.type === 'complete') {
            addMsg(accountId, `✅ ${event.message || ''}`)
            onComplete()
          } else if (event.type === 'error') {
            addMsg(accountId, `❌ ${event.error || 'Unknown error'}`)
          }
        } catch { /* ignore parse errors */ }
      }
    }
  }

  async function handleConnect(accountId: string) {
    const form = connectionForms[accountId]
    if (!form?.loginUrl || !form?.username || !form?.password) return
    setConnectingAccount(accountId)
    clearMsgs(accountId)
    setLiveUrl(null)
    try {
      await streamSSE('/api/bank-agent/connect', {
        accountId, loginUrl: form.loginUrl, username: form.username, password: form.password,
      }, accountId, () => window.location.reload())
    } catch (err) {
      addMsg(accountId, `❌ Connection failed: ${err}`)
    } finally {
      setConnectingAccount(null)
      setLiveUrl(null)
    }
  }

  async function handleSync(accountId: string) {
    setSyncingAccount(accountId)
    clearMsgs(accountId)
    setLiveUrl(null)
    try {
      await streamSSE('/api/bank-agent/sync', { accountId }, accountId, () => loadStatus(accountId))
    } catch (err) {
      addMsg(accountId, `❌ Sync failed: ${err}`)
    } finally {
      setSyncingAccount(null)
      setLiveUrl(null)
    }
  }

  async function handleDisconnect(accountId: string) {
    if (!confirm('Disconnect this account? You will need to reconnect to sync again.')) return
    setDisconnectingAccount(accountId)
    try {
      const res = await fetch('/api/bank-agent/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      })
      if (res.ok) window.location.reload()
      else alert('Failed to disconnect account')
    } catch (err) {
      alert(`Failed to disconnect: ${err}`)
    } finally {
      setDisconnectingAccount(null)
    }
  }

  return (
    <>
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 mb-4 text-sm text-blue-700">
        A cloud browser logs into your bank on your behalf. Credentials are encrypted at rest.
        You may need to approve a 2FA notification on your phone — just do it as you normally would.
      </div>

      <div className="flex flex-col gap-3">
        {accounts.map(account => {
          const form = connectionForms[account.id]
          const messages = streamMessages[account.id] || []
          const isConnected = !!account.bankPlaybook
          const status = accountStatuses[account.id]
          const isBusy = connectingAccount === account.id || syncingAccount === account.id

          return (
            <div key={account.id} className="rounded-lg border bg-background p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{account.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {account.institution.name} · {account.type.replace(/_/g, ' ')}
                  </p>
                  {isConnected && (
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                      <span className={cn(
                        'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium',
                        account.bankPlaybook!.status === 'verified' ? 'bg-green-100 text-green-800' :
                        account.bankPlaybook!.status === 'broken' ? 'bg-amber-100 text-amber-800' :
                        'bg-gray-100 text-gray-700'
                      )}>
                        {account.bankPlaybook!.status}
                      </span>
                      {account.bankPlaybook!.lastVerifiedAt && (
                        <span className="text-xs text-muted-foreground">
                          Synced {formatDistanceToNow(new Date(account.bankPlaybook!.lastVerifiedAt), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!isConnected ? (
                    <button
                      onClick={() => toggleForm(account.id)}
                      className="text-xs px-3 py-1.5 rounded-md bg-foreground text-background hover:opacity-90 transition-opacity"
                    >
                      Connect
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleSync(account.id)}
                        disabled={isBusy}
                        className="text-xs px-3 py-1.5 rounded-md border border-black/15 hover:bg-muted disabled:opacity-50 transition-colors"
                      >
                        {syncingAccount === account.id ? 'Syncing…' : 'Sync now'}
                      </button>
                      <button
                        onClick={() => handleDisconnect(account.id)}
                        disabled={disconnectingAccount === account.id}
                        className="text-xs px-3 py-1.5 rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                      >
                        {disconnectingAccount === account.id ? 'Removing…' : 'Disconnect'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Connection form */}
              {!isConnected && form?.showForm && (
                <div className="mt-4 space-y-3 border-t pt-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Bank login URL</label>
                    <input type="url" value={form.loginUrl}
                      onChange={(e) => updateForm(account.id, 'loginUrl', e.target.value)}
                      placeholder="https://www.yourbank.com/login"
                      className="block w-full px-3 py-1.5 border border-black/15 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#534AB7]/30"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Username</label>
                      <input type="text" value={form.username}
                        onChange={(e) => updateForm(account.id, 'username', e.target.value)}
                        className="block w-full px-3 py-1.5 border border-black/15 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#534AB7]/30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Password</label>
                      <input type="password" value={form.password}
                        onChange={(e) => updateForm(account.id, 'password', e.target.value)}
                        className="block w-full px-3 py-1.5 border border-black/15 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#534AB7]/30"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => toggleForm(account.id)}
                      className="text-sm px-3 py-1.5 border border-black/15 rounded-md hover:bg-muted transition-colors">
                      Cancel
                    </button>
                    <button
                      onClick={() => handleConnect(account.id)}
                      disabled={!form.loginUrl || !form.username || !form.password || connectingAccount === account.id}
                      className="text-sm px-3 py-1.5 bg-foreground text-background rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {connectingAccount === account.id ? 'Connecting…' : 'Connect'}
                    </button>
                  </div>
                </div>
              )}

              {/* Stream log */}
              {messages.length > 0 && (
                <div className="mt-4 border-t pt-4">
                  <div className="rounded-md bg-muted/60 p-3 max-h-36 overflow-y-auto space-y-1">
                    {messages.map((msg, i) => (
                      <p key={i} className="text-xs text-foreground">{msg}</p>
                    ))}
                  </div>
                  {liveUrl && (
                    <a href={liveUrl} target="_blank" rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-amber-600 text-white rounded-md hover:bg-amber-700">
                      Enter code in browser
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                </div>
              )}

              {/* Recent syncs */}
              {isConnected && status?.recentSyncs?.length > 0 && (
                <div className="mt-4 border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Recent syncs</p>
                  <div className="space-y-1">
                    {status.recentSyncs.slice(0, 3).map(sync => (
                      <div key={sync.id} className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {sync.status === 'COMPLETE' && `✅ ${sync.imported || 0} imported, ${sync.skipped || 0} skipped`}
                          {sync.status === 'FAILED' && `❌ ${sync.error}`}
                          {sync.status !== 'COMPLETE' && sync.status !== 'FAILED' && sync.status}
                        </span>
                        <span>{formatDistanceToNow(new Date(sync.startedAt), { addSuffix: true })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; description: string }[] = [
  { id: 'accounts', label: 'Accounts', description: 'Manage your bank accounts and cards' },
  { id: 'auto-sync', label: 'Auto Sync', description: 'Connect via Teller or Plaid for automatic syncing' },
  { id: 'manual-sync', label: 'Manual Sync', description: 'Use browser automation to sync any bank' },
]

export function BankAccountsClient({ accounts, initialTab, onboarding }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [tabLoading, setTabLoading] = useState(false)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bank Accounts &amp; Cards</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {TABS.find(t => t.id === tab)?.description}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { if (tab !== t.id) { setTabLoading(true); setTab(t.id); setTimeout(() => setTabLoading(false), 300) } }}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.id
                ? 'border-[#534AB7] text-[#3C3489]'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tabLoading && tab === t.id ? <span className="inline-block w-3 h-3 rounded-full border-2 border-[#534AB7] border-t-transparent animate-spin" /> : t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'accounts' && <AccountsTab accounts={accounts} onboarding={onboarding} />}
      {tab === 'auto-sync' && <AutoSyncTab accounts={accounts} />}
      {tab === 'manual-sync' && <ManualSyncTab accounts={accounts} />}
    </div>
  )
}
