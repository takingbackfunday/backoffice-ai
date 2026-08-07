'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { JobSelect } from './job-select'

interface Props {
  projectId: string
  projectSlug: string
  jobs: { id: string; name: string }[]
  templates: { id: string; name: string }[]
  recentQuotes: { id: string; quoteNumber: string; title: string }[]
}

type StartMode = 'blank' | 'template' | 'duplicate'

export function NewQuoteForm({ projectId, projectSlug, jobs, templates, recentQuotes }: Props) {
  const router = useRouter()
  const [startMode, setStartMode] = useState<StartMode>('blank')
  const [title, setTitle] = useState('')
  const [jobId, setJobId] = useState(jobs[0]?.id ?? '')
  const [templateId, setTemplateId] = useState('')
  const [selectedRecentQuoteId, setSelectedRecentQuoteId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      let res: Response

      if (startMode === 'duplicate') {
        if (!selectedRecentQuoteId) { setError('Select a recent quote to duplicate'); return }
        res = await fetch(`/api/projects/${projectId}/quotes/${selectedRecentQuoteId}/duplicate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      } else {
        if (!jobId) { setError('Select a job'); return }
        const body: Record<string, unknown> = {
          jobId,
          title: title.trim() || undefined,
        }
        if (startMode === 'template' && templateId) {
          body.templateId = templateId
        }
        res = await fetch(`/api/projects/${projectId}/quotes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }

      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to create quote'); return }
      router.push(`/projects/${projectSlug}/quotes/${json.data.id}/edit`)
    } catch {
      setError('Failed to create quote')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Start mode selector */}
      <div>
        <label className="block text-sm font-medium mb-2">Create from</label>
        <div className="flex gap-2">
          {(['blank', 'template', 'duplicate'] as StartMode[]).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => setStartMode(mode)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                startMode === mode
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              {mode === 'blank' ? 'From scratch' : mode === 'template' ? 'From template' : 'Duplicate recent'}
            </button>
          ))}
        </div>
      </div>

      {/* Title (blank + template modes) */}
      {startMode !== 'duplicate' && (
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
      )}

      {/* Job select (blank + template modes) */}
      {startMode !== 'duplicate' && (
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
      )}

      {/* Template select (template mode) */}
      {startMode === 'template' && templates.length > 0 && (
        <div>
          <label className="block text-sm font-medium mb-1">Template</label>
          <select
            value={templateId}
            onChange={e => setTemplateId(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm bg-background"
          >
            <option value="">— none —</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Recent quote select (duplicate mode) */}
      {startMode === 'duplicate' && (
        <div>
          <label className="block text-sm font-medium mb-1">Recent quote</label>
          <select
            value={selectedRecentQuoteId}
            onChange={e => setSelectedRecentQuoteId(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm bg-background"
            required
          >
            <option value="">— select a quote —</option>
            {recentQuotes.map(q => (
              <option key={q.id} value={q.id}>
                {q.quoteNumber} — {q.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={submitting || (startMode !== 'duplicate' && jobs.length === 0)}
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
