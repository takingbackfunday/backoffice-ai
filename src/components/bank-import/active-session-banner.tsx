'use client'

import { useEffect, useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { BankImportDialog } from './bank-import-dialog'
import { ConfirmDialog } from '@/components/upload/confirm-dialog'
import { discardBankImportSession } from '@/lib/bank-import/discard'

interface ActiveSession {
  id: string
  status: string
  bankName: string
}

export function ActiveSessionBanner() {
  const [session, setSession] = useState<ActiveSession | null>(null)
  const [resumeId, setResumeId] = useState<string | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [discardError, setDiscardError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/bank-import/sessions/active', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const json = await response.json()
        if (!controller.signal.aborted && response.ok && json.data) setSession(json.data as ActiveSession)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  async function discard() {
    if (!session || discarding) return
    setDiscarding(true)
    setDiscardError(null)
    try {
      await discardBankImportSession(session.id)
      setSession(null)
      setDiscardOpen(false)
    } catch {
      setDiscardError('Could not discard the bank download. Please try again.')
    } finally {
      setDiscarding(false)
    }
  }

  if (!session) return null
  if (session.status === 'CAPTURED') {
    return (
      <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-4 py-3">
          <p className="text-sm">Your {session.bankName} download is ready to review.</p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setDiscardOpen(true)}>Discard download</Button>
            <a className={buttonVariants({ size: 'sm' })} href={`/upload?bankImport=${encodeURIComponent(session.id)}`}
              aria-disabled={discardOpen} onClick={(event) => { if (discardOpen) event.preventDefault() }}>Review</a>
          </div>
        </div>
        <ConfirmDialog open={discardOpen} title={`Discard your ${session.bankName} download?`}
          body="This download will be removed from review. No transactions will be imported or deleted."
          confirmLabel={discarding ? 'Discarding...' : 'Discard'} cancelLabel="Keep download"
          destructive pending={discarding}
          onCancel={() => { setDiscardOpen(false); setDiscardError(null) }} onConfirm={() => { void discard() }}>
          {discardError && <p className="text-sm text-destructive" role="alert">{discardError}</p>}
        </ConfirmDialog>
      </>
    )
  }
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-4 py-3">
        <p className="text-sm">{session.bankName} import in progress.</p>
        <Button size="sm" variant="outline" onClick={() => setResumeId(session.id)}>Open</Button>
      </div>
      <BankImportDialog open={resumeId !== null} onOpenChange={(open) => { if (!open) setResumeId(null) }} resumeSessionId={resumeId ?? undefined} />
    </>
  )
}
