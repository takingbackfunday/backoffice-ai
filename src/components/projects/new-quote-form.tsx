'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FilePlus2, LayoutTemplate, Copy, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { JobSelect } from './job-select'
import { WorkProfileSetup } from '@/components/setup/work-profile-setup'
import { GenerateTemplateForm } from './generate-template-form'

interface Props {
  projectId: string
  projectSlug: string
  jobs: { id: string; name: string }[]
  templates: { id: string; name: string }[]
  recentQuotes: { id: string; quoteNumber: string; title: string }[]
  workDescription?: string
}

type StartMode = 'blank' | 'template' | 'duplicate'

export function NewQuoteForm({ projectId, projectSlug, jobs, templates, recentQuotes, workDescription }: Props) {
  const router = useRouter()
  const [startMode, setStartMode] = useState<StartMode>('blank')
  const [title, setTitle] = useState('')
  const [jobId, setJobId] = useState(jobs[0]?.id ?? '')
  const [templateId, setTemplateId] = useState('')
  const [selectedRecentQuoteId, setSelectedRecentQuoteId] = useState('')
  const [showGenerate, setShowGenerate] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleProfileComplete = useCallback(() => {
    router.refresh()
    setStartMode('template')
  }, [router])

  const handleGenerateClick = useCallback(() => {
    setStartMode('template')
    setShowGenerate(true)
  }, [])

  const handleGeneratedTemplate = useCallback((templateId: string) => {
    setTemplateId(templateId)
    setShowGenerate(false)
    router.refresh()
  }, [router])

  const modes: { value: StartMode; icon: typeof FilePlus2; label: string; blurb: string }[] = [
    { value: 'blank', icon: FilePlus2, label: 'From scratch', blurb: 'Empty quote' },
    { value: 'template', icon: LayoutTemplate, label: 'From template', blurb: 'Reuse a saved structure' },
    { value: 'duplicate', icon: Copy, label: 'Duplicate recent', blurb: 'Copy an existing quote' },
  ]

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
        if (startMode === 'template' && !templateId) { setError('Select a template'); return }
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
      {/* Start mode selector — card grid */}
      <div>
        <label className="block text-sm font-medium mb-2">Create from</label>
        <div className="grid grid-cols-3 gap-2">
          {modes.map(m => {
            const Icon = m.icon
            const active = startMode === m.value
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => setStartMode(m.value)}
                className={cn(
                  'rounded-xl border p-3 text-left transition-colors',
                  active ? 'border-primary bg-primary/5' : 'text-muted-foreground hover:bg-accent'
                )}
              >
                <Icon className={cn('w-5 h-5 mb-1.5', active ? 'text-primary' : 'text-muted-foreground')} />
                <p className={cn('text-sm font-medium', active ? 'text-foreground' : '')}>{m.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{m.blurb}</p>
              </button>
            )
          })}
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
          <Link
            href="/settings#quote-templates"
            className="text-xs text-primary hover:underline mt-1 inline-block"
          >
            Manage templates →
          </Link>
        </div>
      )}

      {/* Empty state for template mode — use work profile or inline setup */}
      {startMode === 'template' && templates.length === 0 && (
        <div className="border rounded-lg p-3">
          {workDescription ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">No templates yet, but you have a work profile saved.</p>
              <Link
                href="/settings#work-profile"
                className="text-xs text-primary hover:underline inline-block"
              >
                Create templates from your work profile in Settings →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                No templates yet. Describe your work and we&rsquo;ll generate templates and a service library.
              </p>
              <WorkProfileSetup mode="inline" onComplete={handleProfileComplete} />
            </div>
          )}
        </div>
      )}

      {/* Generate-from-description section (blank + template modes) */}
      {startMode !== 'duplicate' && (
        <div>
          {showGenerate ? (
            <GenerateTemplateForm onCreated={handleGeneratedTemplate} workDescription={workDescription} />
          ) : (
            <button
              type="button"
              onClick={handleGenerateClick}
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <Sparkles className="w-3 h-3" />
              Generate a template from a job description
            </button>
          )}
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
          disabled={submitting || (startMode !== 'duplicate' && !jobId)}
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
