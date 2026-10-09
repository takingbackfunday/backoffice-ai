'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { BankImportDialog } from './bank-import-dialog'

interface ActiveSession {
  id: string
  status: string
  bankName: string
}

export function ActiveSessionBanner() {
  const router = useRouter()
  const [session, setSession] = useState<ActiveSession | null>(null)
  const [resumeId, setResumeId] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/bank-import/sessions/active', { signal: controller.signal })
      .then(async (response) => {
        const json = await response.json()
        if (response.ok && json.data) setSession(json.data as ActiveSession)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [])

  if (!session) return null
  if (session.status === 'CAPTURED') {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-4 py-3">
        <p className="text-sm">Your {session.bankName} download is ready to review.</p>
        <Button size="sm" onClick={() => router.push(`/upload?bankImport=${encodeURIComponent(session.id)}`)}>Review</Button>
      </div>
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
