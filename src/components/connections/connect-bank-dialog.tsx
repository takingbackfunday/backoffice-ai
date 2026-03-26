'use client'

import { useState } from 'react'
import { TellerConnectButton } from './teller-connect'
import { PlaidLinkButton } from './plaid-link'
import type { ConnectionInitResponse } from '@/types/bank-providers'

interface ConnectBankDialogProps {
  accountId: string
  onConnected: (result: { connectionId: string; imported: number; skipped: number }) => void
  onCancel: () => void
}

export function ConnectBankDialog({ accountId, onConnected, onCancel }: ConnectBankDialogProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'provider_ready' | 'connecting' | 'error'>('idle')
  const [initData, setInitData] = useState<ConnectionInitResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function initialize() {
    setStatus('loading')
    setError(null)
    try {
      const res = await fetch('/api/connections/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error || 'Failed to initialize')
        setStatus('error')
        return
      }
      setInitData(json.data)
      setStatus('provider_ready')
    } catch {
      setError('Network error')
      setStatus('error')
    }
  }

  async function handleTellerSuccess(enrollment: {
    accessToken: string
    enrollmentId: string
    institution: { name: string }
  }) {
    setStatus('connecting')
    try {
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          provider: 'TELLER',
          tellerAccessToken: enrollment.accessToken,
          tellerEnrollmentId: enrollment.enrollmentId,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error || 'Failed to save connection')
        setStatus('error')
        return
      }
      onConnected(json.data)
    } catch {
      setError('Network error saving connection')
      setStatus('error')
    }
  }

  async function handlePlaidSuccess(publicToken: string, metadata: {
    institution?: { institution_id: string; name: string }
    accounts: { id: string; name: string }[]
  }) {
    setStatus('connecting')
    try {
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          provider: 'PLAID',
          plaidPublicToken: publicToken,
          plaidAccountId: metadata.accounts[0]?.id,
          plaidInstitutionId: metadata.institution?.institution_id,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error || 'Failed to save connection')
        setStatus('error')
        return
      }
      onConnected(json.data)
    } catch {
      setError('Network error saving connection')
      setStatus('error')
    }
  }

  if (status === 'idle') {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Connect your bank account for automatic transaction syncing.
        </p>
        <div className="flex gap-2">
          <button
            onClick={initialize}
            className="inline-flex items-center justify-center rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 transition-opacity"
          >
            Connect bank
          </button>
          <button onClick={onCancel} className="text-sm text-muted-foreground hover:underline">
            Cancel
          </button>
        </div>
      </div>
    )
  }

  if (status === 'loading') {
    return <p className="text-sm text-muted-foreground">Preparing connection…</p>
  }

  if (status === 'connecting') {
    return <p className="text-sm text-muted-foreground">Saving connection and importing transactions…</p>
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={initialize} className="text-sm underline">Try again</button>
      </div>
    )
  }

  if (status === 'provider_ready' && initData) {
    if (initData.provider === 'TELLER' && initData.tellerAppId) {
      return (
        <TellerConnectButton
          appId={initData.tellerAppId}
          environment={initData.tellerEnvironment}
          onSuccess={handleTellerSuccess}
          onExit={onCancel}
        />
      )
    }

    if (initData.provider === 'PLAID' && initData.plaidLinkToken) {
      return (
        <PlaidLinkButton
          linkToken={initData.plaidLinkToken}
          onSuccess={handlePlaidSuccess}
          onExit={onCancel}
        />
      )
    }

    if (initData.provider === 'BROWSER_AGENT') {
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            This institution isn&apos;t supported by our banking APIs.
            You can use manual browser-based connection instead.
          </p>
          <a
            href="/bank-sync"
            className="text-sm text-blue-600 underline"
          >
            Go to manual bank sync →
          </a>
        </div>
      )
    }
  }

  return null
}
