'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

type State =
  | { kind: 'loading' }
  | { kind: 'success'; provider: string; imported: number; skipped: number }
  | { kind: 'warning'; provider: string; message: string }
  | { kind: 'error'; provider: string; message: string }

const PROVIDER_LABELS: Record<string, string> = {
  'enable-banking': 'Enable Banking',
  plaid: 'Plaid',
}

export default function ConnectCallbackPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    const provider = searchParams.get('provider') ?? 'unknown'
    const error = searchParams.get('error')
    const warning = searchParams.get('warning')
    const connectionId = searchParams.get('connectionId')
    const imported = parseInt(searchParams.get('imported') ?? '0', 10)
    const skipped = parseInt(searchParams.get('skipped') ?? '0', 10)

    if (error) {
      const messages: Record<string, string> = {
        account_not_found: 'Account not found. Please try again.',
        no_accounts: 'No accounts were returned by your bank.',
        access_denied: 'You declined to share account access.',
      }
      setState({ kind: 'error', provider, message: messages[error] ?? `Connection failed: ${error}` })
      return
    }

    if (warning === 'sync_failed' && connectionId) {
      setState({
        kind: 'warning',
        provider,
        message: 'Bank connected but the initial sync failed. You can retry from the connections page.',
      })
      return
    }

    if (connectionId) {
      setState({ kind: 'success', provider, imported, skipped })
      return
    }

    setState({ kind: 'loading' })
  }, [searchParams])

  function handleContinue() {
    router.push('/bank-accounts')
  }

  if (state.kind === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Completing bank connection…</p>
      </div>
    )
  }

  if (state.kind === 'success') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="max-w-sm w-full rounded-xl border bg-background p-8 flex flex-col gap-4 text-center">
          <p className="text-2xl">✓</p>
          <h1 className="font-semibold text-lg">
            {PROVIDER_LABELS[state.provider] ?? state.provider} connected
          </h1>
          <p className="text-sm text-muted-foreground">
            {state.imported} transaction{state.imported !== 1 ? 's' : ''} imported
            {state.skipped > 0 ? `, ${state.skipped} already existed` : ''}.
          </p>
          <button
            onClick={handleContinue}
            className="mt-2 inline-flex items-center justify-center rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 transition-opacity"
          >
            Go to bank accounts
          </button>
        </div>
      </div>
    )
  }

  if (state.kind === 'warning') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="max-w-sm w-full rounded-xl border bg-background p-8 flex flex-col gap-4 text-center">
          <p className="text-2xl">⚠</p>
          <h1 className="font-semibold text-lg">Connected with a warning</h1>
          <p className="text-sm text-muted-foreground">{state.message}</p>
          <button
            onClick={handleContinue}
            className="mt-2 inline-flex items-center justify-center rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 transition-opacity"
          >
            Go to bank accounts
          </button>
        </div>
      </div>
    )
  }

  // error
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="max-w-sm w-full rounded-xl border bg-background p-8 flex flex-col gap-4 text-center">
        <p className="text-2xl">✗</p>
        <h1 className="font-semibold text-lg">Connection failed</h1>
        <p className="text-sm text-red-600">{state.message}</p>
        <button
          onClick={handleContinue}
          className="mt-2 inline-flex items-center justify-center rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 transition-opacity"
        >
          Back to bank accounts
        </button>
      </div>
    </div>
  )
}
