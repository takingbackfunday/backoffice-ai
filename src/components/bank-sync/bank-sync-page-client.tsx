'use client'

import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import type { SyncJobEvent } from '@/types/bank-agent'

interface BankPlaybook {
  id: string
  status: string
  lastVerifiedAt: string | null
  twoFaType: string
}

interface Institution {
  id: string
  name: string
  country: string
  createdAt: string
  updatedAt: string
}

interface Account {
  id: string
  name: string
  type: string
  currency: string
  lastImportAt: string | null
  createdAt: string
  updatedAt: string
  institution: Institution
  bankPlaybook: BankPlaybook | null
}

interface SyncJobStatus {
  id: string
  status: string
  triggeredBy: string
  startedAt: string
  completedAt: string | null
  error: string | null
  imported: number | null
  skipped: number | null
}

interface StatusData {
  isConnected: boolean
  playbook: BankPlaybook | null
  recentSyncs: SyncJobStatus[]
}

interface BankSyncPageClientProps {
  accounts: Account[]
}

export function BankSyncPageClient({ accounts }: BankSyncPageClientProps) {
  const [connectingAccount, setConnectingAccount] = useState<string | null>(null)
  const [syncingAccount, setSyncingAccount] = useState<string | null>(null)
  const [disconnectingAccount, setDisconnectingAccount] = useState<string | null>(null)
  const [streamMessages, setStreamMessages] = useState<{ [accountId: string]: string[] }>({})
  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  const [accountStatuses, setAccountStatuses] = useState<{ [accountId: string]: StatusData }>({})

  // Form state for connection
  const [connectionForms, setConnectionForms] = useState<{
    [accountId: string]: {
      loginUrl: string
      username: string
      password: string
      showForm: boolean
    }
  }>({})

  const addStreamMessage = (accountId: string, message: string) => {
    setStreamMessages(prev => ({
      ...prev,
      [accountId]: [...(prev[accountId] || []), message]
    }))
  }

  const clearStreamMessages = (accountId: string) => {
    setStreamMessages(prev => ({ ...prev, [accountId]: [] }))
  }

  const updateForm = (accountId: string, field: string, value: string) => {
    setConnectionForms(prev => ({
      ...prev,
      [accountId]: {
        ...prev[accountId],
        [field]: value
      }
    }))
  }

  const toggleForm = (accountId: string) => {
    setConnectionForms(prev => ({
      ...prev,
      [accountId]: {
        loginUrl: prev[accountId]?.loginUrl || '',
        username: prev[accountId]?.username || '',
        password: prev[accountId]?.password || '',
        showForm: !prev[accountId]?.showForm
      }
    }))
  }

  const loadAccountStatus = async (accountId: string) => {
    try {
      const response = await fetch(`/api/bank-agent/status?accountId=${accountId}`)
      if (response.ok) {
        const result = await response.json()
        setAccountStatuses(prev => ({ ...prev, [accountId]: result.data }))
      }
    } catch (err) {
      console.error('Failed to load account status:', err)
    }
  }

  const handleConnect = async (accountId: string) => {
    const form = connectionForms[accountId]
    if (!form?.loginUrl || !form?.username || !form?.password) return

    setConnectingAccount(accountId)
    clearStreamMessages(accountId)
    setLiveUrl(null)

    try {
      const response = await fetch('/api/bank-agent/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          loginUrl: form.loginUrl,
          username: form.username,
          password: form.password,
        }),
      })

      if (!response.body) throw new Error('No response stream')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event: SyncJobEvent = JSON.parse(line.slice(6))

              if (event.type === 'status') {
                addStreamMessage(accountId, event.message || '')
              } else if (event.type === 'twofa_required') {
                addStreamMessage(accountId, `🔒 ${event.message || ''}`)
                if (event.liveUrl) setLiveUrl(event.liveUrl)
              } else if (event.type === 'complete') {
                addStreamMessage(accountId, `✅ ${event.message || ''}`)
                // Reload page to show connected state
                window.location.reload()
              } else if (event.type === 'error') {
                addStreamMessage(accountId, `❌ ${event.error || 'Unknown error'}`)
              }
            } catch (e) {
              console.error('Failed to parse SSE event:', e)
            }
          }
        }
      }
    } catch (err) {
      addStreamMessage(accountId, `❌ Connection failed: ${err}`)
    } finally {
      setConnectingAccount(null)
      setLiveUrl(null)
    }
  }

  const handleSync = async (accountId: string) => {
    setSyncingAccount(accountId)
    clearStreamMessages(accountId)
    setLiveUrl(null)

    try {
      const response = await fetch('/api/bank-agent/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      })

      if (!response.body) throw new Error('No response stream')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event: SyncJobEvent = JSON.parse(line.slice(6))

              if (event.type === 'status') {
                addStreamMessage(accountId, event.message || '')
              } else if (event.type === 'twofa_required') {
                addStreamMessage(accountId, `🔒 ${event.message || ''}`)
                if (event.liveUrl) setLiveUrl(event.liveUrl)
              } else if (event.type === 'complete') {
                addStreamMessage(accountId, `✅ ${event.message || ''}`)
                loadAccountStatus(accountId) // Refresh status
              } else if (event.type === 'error') {
                addStreamMessage(accountId, `❌ ${event.error || 'Unknown error'}`)
              }
            } catch (e) {
              console.error('Failed to parse SSE event:', e)
            }
          }
        }
      }
    } catch (err) {
      addStreamMessage(accountId, `❌ Sync failed: ${err}`)
    } finally {
      setSyncingAccount(null)
      setLiveUrl(null)
    }
  }

  const handleDisconnect = async (accountId: string) => {
    if (!confirm('Are you sure you want to disconnect this bank account? You will need to reconnect to sync again.')) return

    setDisconnectingAccount(accountId)
    try {
      const response = await fetch('/api/bank-agent/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      })

      if (response.ok) {
        // Reload page to show disconnected state
        window.location.reload()
      } else {
        alert('Failed to disconnect account')
      }
    } catch (err) {
      alert(`Failed to disconnect account: ${err}`)
    } finally {
      setDisconnectingAccount(null)
    }
  }

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'verified': return 'bg-green-100 text-green-800'
      case 'broken': return 'bg-amber-100 text-amber-800'
      case 'draft': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-6">
      {/* Warning banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">
              Bank Sync Information
            </h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>A cloud browser will log into your bank. Your credentials are encrypted at rest. You may need to approve a 2FA notification on your phone — just do it as you normally would.</p>
            </div>
          </div>
        </div>
      </div>

      {accounts.map(account => {
        const form = connectionForms[account.id]
        const messages = streamMessages[account.id] || []
        const isConnected = !!account.bankPlaybook
        const status = accountStatuses[account.id]

        return (
          <div key={account.id} className="bg-white border rounded-lg p-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-medium text-gray-900">
                  {account.name}
                </h3>
                <p className="text-sm text-gray-500">
                  {account.institution.name} • {account.type.toLowerCase().replace(/_/g, ' ')}
                </p>

                {isConnected && (
                  <div className="mt-2 flex items-center gap-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getStatusBadgeColor(account.bankPlaybook!.status)}`}>
                      {account.bankPlaybook!.status}
                    </span>
                    {account.bankPlaybook!.lastVerifiedAt && (
                      <span className="text-xs text-gray-500">
                        Last synced: {formatDistanceToNow(new Date(account.bankPlaybook!.lastVerifiedAt), { addSuffix: true })}
                      </span>
                    )}
                    <span className="text-xs text-gray-500">
                      2FA: {account.bankPlaybook!.twoFaType}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {!isConnected ? (
                  <button
                    onClick={() => toggleForm(account.id)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
                  >
                    Connect Bank
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => handleSync(account.id)}
                      disabled={syncingAccount === account.id}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium disabled:opacity-50"
                    >
                      {syncingAccount === account.id ? 'Syncing...' : 'Sync Now'}
                    </button>
                    <button
                      onClick={() => handleDisconnect(account.id)}
                      disabled={disconnectingAccount === account.id}
                      className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-medium disabled:opacity-50"
                    >
                      {disconnectingAccount === account.id ? 'Disconnecting...' : 'Disconnect'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Connection form */}
            {!isConnected && form?.showForm && (
              <div className="mt-4 space-y-3 border-t pt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Bank Login URL</label>
                  <input
                    type="url"
                    value={form.loginUrl}
                    onChange={(e) => updateForm(account.id, 'loginUrl', e.target.value)}
                    placeholder="https://www.yourbank.com/login"
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Username</label>
                    <input
                      type="text"
                      value={form.username}
                      onChange={(e) => updateForm(account.id, 'username', e.target.value)}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Password</label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => updateForm(account.id, 'password', e.target.value)}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => toggleForm(account.id)}
                    className="px-3 py-2 text-gray-600 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleConnect(account.id)}
                    disabled={!form.loginUrl || !form.username || !form.password || connectingAccount === account.id}
                    className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
                  >
                    {connectingAccount === account.id ? 'Connecting...' : 'Connect'}
                  </button>
                </div>
              </div>
            )}

            {/* Stream messages */}
            {messages.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <div className="bg-gray-50 rounded-md p-3 max-h-40 overflow-y-auto">
                  <div className="space-y-1">
                    {messages.map((message, i) => (
                      <div key={i} className="text-sm text-gray-700">
                        {message}
                      </div>
                    ))}
                  </div>
                </div>

                {liveUrl && (
                  <div className="mt-2">
                    <a
                      href={liveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-3 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 text-sm font-medium"
                    >
                      Enter Code in Browser
                      <svg className="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Sync history */}
            {isConnected && status?.recentSyncs && status.recentSyncs.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Recent Syncs</h4>
                <div className="space-y-1">
                  {status.recentSyncs.slice(0, 3).map(sync => (
                    <div key={sync.id} className="flex items-center justify-between text-xs text-gray-500">
                      <span>
                        {sync.status === 'COMPLETE' && `✅ Imported ${sync.imported || 0}, skipped ${sync.skipped || 0}`}
                        {sync.status === 'FAILED' && `❌ ${sync.error}`}
                        {sync.status !== 'COMPLETE' && sync.status !== 'FAILED' && sync.status}
                      </span>
                      <span>
                        {formatDistanceToNow(new Date(sync.startedAt), { addSuffix: true })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}