'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'

interface Props {
  projectId: string
  projectSlug: string
  estimateId: string
  estimateStatus: string
  jobs: { id: string; name: string }[]
}

export function QuoteFromEstimate({ projectId, projectSlug, estimateId, estimateStatus, jobs }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [jobId, setJobId] = useState(jobs[0]?.id ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (estimateStatus !== 'FINAL') {
    return (
      <span className="text-xs text-muted-foreground shrink-0">finalise to quote</span>
    )
  }

  async function handleCreate() {
    if (!jobId) { setError('Select a job'); return }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estimateId, jobId }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed'); return }
      router.push(`/projects/${projectSlug}/quotes/${json.data.id}/generate`)
    } catch {
      setError('Failed to create quote')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
      >
        <Plus className="w-3 h-3" /> Create quote
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      {jobs.length === 0 ? (
        <span className="text-xs text-muted-foreground">No active jobs</span>
      ) : (
        <select
          value={jobId}
          onChange={e => setJobId(e.target.value)}
          className="text-xs border rounded px-2 py-1 bg-background"
          autoFocus
        >
          {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
        </select>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
      <button
        onClick={handleCreate}
        disabled={submitting || jobs.length === 0}
        className="text-xs px-2.5 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {submitting ? '…' : 'Go'}
      </button>
      <button
        onClick={() => { setOpen(false); setError(null) }}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        Cancel
      </button>
    </div>
  )
}
