'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { JobSelect } from './job-select'

interface Props {
  projectId: string
  projectSlug: string
  jobs: { id: string; name: string }[]
  estimates: { id: string; title: string; status: string }[]
}

export function NewQuoteForm({ projectId, projectSlug, jobs, estimates }: Props) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [jobId, setJobId] = useState(jobs[0]?.id ?? '')
  const [estimateId, setEstimateId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!jobId) { setError('Select a job'); return }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          title: title.trim() || undefined,
          estimateId: estimateId || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to create quote'); return }
      router.push(`/projects/${projectSlug}/quotes/${json.data.id}/generate`)
    } catch {
      setError('Failed to create quote')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Title <span className="text-muted-foreground font-normal">(optional)</span></label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Website Redesign"
          className="w-full border rounded px-3 py-2 text-sm bg-background"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Job</label>
        <JobSelect
          value={jobId}
          onChange={setJobId}
          jobs={jobs}
          projectId={projectId}
          required
        />
      </div>

      {estimates.length > 0 && (
        <div>
          <label className="block text-sm font-medium mb-1">
            Based on estimate <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <select
            value={estimateId}
            onChange={e => setEstimateId(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm bg-background"
          >
            <option value="">— none —</option>
            {estimates.map(est => (
              <option key={est.id} value={est.id}>
                {est.title} ({est.status.toLowerCase()})
              </option>
            ))}
          </select>
          {estimateId && estimates.find(e => e.id === estimateId)?.status !== 'FINAL' && (
            <p className="text-xs text-amber-600 mt-1">This estimate is not finalised — line items may be incomplete.</p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={submitting || jobs.length === 0}
          className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? 'Creating…' : 'Create Quote'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 rounded border text-sm hover:bg-accent"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
