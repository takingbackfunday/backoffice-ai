'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import type { BankImportCommandType } from '@/lib/bank-import/status'
import { statusCopy } from '@/lib/bank-import/status-copy'
import { LiveViewFrame } from './live-view-frame'
import { SessionTimeline } from './session-timeline'
import { SessionDiagnostics } from './session-diagnostics'
import { useBankImportSession } from './hooks/use-bank-import-session'

export function SessionStep({ id, onClose, onRetry }: { id: string; onClose: () => void; onRetry: () => void }) {
  const router = useRouter()
  const { snapshot, events, error, liveUrl, queuedForMs, send } = useBankImportSession(id)
  const [commandError, setCommandError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const navigatedRef = useRef(false)
  const status = snapshot?.status ?? 'STARTING'
  const copy = statusCopy({
    status,
    needsUserReason: snapshot?.needsUserReason ?? null,
    bankName: snapshot?.bankName ?? 'your bank',
    queuedForMs,
    errorMessage: snapshot?.errorMessage ?? null,
  })
  const interactive = status === 'AWAITING_LOGIN' || status === 'NEEDS_USER'

  useEffect(() => {
    if (status !== 'CAPTURED' || navigatedRef.current) return
    navigatedRef.current = true
    router.push(`/upload?bankImport=${encodeURIComponent(id)}`)
    onClose()
  }, [id, onClose, router, status])

  async function command(type: BankImportCommandType) {
    setSending(true)
    setCommandError(null)
    try { await send(type) } catch (cause) {
      setCommandError(cause instanceof Error ? cause.message : 'Could not send that instruction.')
    } finally { setSending(false) }
  }

  async function retry() {
    if (status === 'QUEUED') await command('CANCEL')
    onRetry()
  }

  function reviewNow() {
    router.push(`/upload?bankImport=${encodeURIComponent(id)}`)
    onClose()
  }

  return (
    <section className="space-y-4" aria-label="Bank import session">
      <header className={`rounded-md border p-3 ${copy.tone === 'error' ? 'border-destructive/40 bg-destructive/5' : copy.tone === 'success' ? 'border-green-600/30 bg-green-600/5' : 'border-border bg-muted/40'}`}>
        <h3 className="text-sm font-semibold">{copy.title}</h3>
        {copy.body && <p className="mt-1 text-sm text-muted-foreground">{copy.body}</p>}
        {snapshot && <p className="mt-1 text-xs text-muted-foreground">{snapshot.bankName} · {snapshot.accountName} · {snapshot.dateFrom} to {snapshot.dateTo}</p>}
      </header>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {commandError && <p className="text-sm text-destructive" role="alert">{commandError}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(250px,1fr)]">
        <LiveViewFrame url={liveUrl} interactive={interactive} />
        <SessionTimeline events={events} />
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
        {status === 'AWAITING_LOGIN' && <Button disabled={sending} onClick={() => command('LOGIN_DONE')}>I’ve signed in</Button>}
        {status === 'NAVIGATING' && <Button disabled={sending} onClick={() => command('TAKEOVER')}>Take over</Button>}
        {status === 'NEEDS_USER' && (
          <>
            <Button disabled={sending} onClick={() => command('RESUME_AGENT')}>Let the assistant continue</Button>
            <Button variant="outline" onClick={() => router.push('/upload')}>Upload manually instead</Button>
          </>
        )}
        {status === 'CAPTURED' && <Button onClick={reviewNow}>Review now</Button>}
        {(status === 'FAILED' || status === 'EXPIRED' || status === 'CANCELLED' || (status === 'QUEUED' && queuedForMs > 90_000)) && (
          <Button variant="outline" onClick={retry}>Try again</Button>
        )}
        {(status === 'FAILED' || status === 'EXPIRED' || status === 'CANCELLED') && <Button variant="outline" onClick={() => router.push('/upload')}>Upload manually instead</Button>}
        {status !== 'CAPTURED' && status !== 'COMPLETE' && status !== 'FAILED' && status !== 'EXPIRED' && status !== 'CANCELLED' && (
          <Button variant="ghost" disabled={sending} onClick={() => command('CANCEL')}>Cancel</Button>
        )}
      </footer>
      <SessionDiagnostics sessionId={id} />
    </section>
  )
}
