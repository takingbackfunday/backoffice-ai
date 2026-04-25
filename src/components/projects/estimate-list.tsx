'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, FileText, ChevronRight, Loader2, GitBranch, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { JobSelect } from './job-select'

interface EstimateItem {
  id: string
  description: string
  costRate: number | null
  hours: number | null
  quantity: number
}

interface EstimateSection {
  id: string
  name: string
  items: EstimateItem[]
}

interface Estimate {
  id: string
  title: string
  status: 'DRAFT' | 'FINAL' | 'SUPERSEDED'
  currency: string
  version: number
  createdAt: string
  updatedAt: string
  sections: EstimateSection[]
  _count?: { quotes: number }
}

interface Job {
  id: string
  name: string
}

interface Props {
  projectId: string
  projectSlug: string
  estimates: Estimate[]
  jobs: Job[]
}

function estimateCost(estimate: Estimate): number {
  return estimate.sections.reduce((sum, s) =>
    sum + s.items.reduce((si, i) => {
      const hours = i.hours ?? 0
      const rate = i.costRate ?? 0
      const qty = i.quantity ?? 1
      if (hours > 0 && rate > 0) return si + hours * rate * qty
      if (rate > 0) return si + rate * qty
      return si
    }, 0),
    0
  )
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  FINAL: 'bg-green-100 text-green-700',
  SUPERSEDED: 'bg-amber-100 text-amber-700',
}

export function EstimateList({ projectId, projectSlug, estimates, jobs }: Props) {
  const router = useRouter()
  const [generating, setGenerating] = useState<string | null>(null)
  const [duplicating, setDuplicating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Job selector for quote generation: estimateId → selected jobId
  const [jobSelecting, setJobSelecting] = useState<string | null>(null)
  const [selectedJobId, setSelectedJobId] = useState<string>('')

  async function handleDuplicate(estimateId: string) {
    setDuplicating(estimateId)
    setError(null)
    try {
      const res = await fetch(
        `/api/projects/${projectId}/estimates/${estimateId}/duplicate`,
        { method: 'POST' }
      )
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to duplicate estimate'); return }
      router.push(`/projects/${projectSlug}/estimates/${json.data.id}`)
    } catch {
      setError('Failed to duplicate estimate')
    } finally {
      setDuplicating(null)
    }
  }

  async function handleGenerateQuote(estimateId: string, jobId: string) {
    setGenerating(estimateId)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estimateId, jobId }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to generate quote'); return }
      router.push(`/projects/${projectSlug}/quotes/${json.data.id}/generate`)
    } catch {
      setError('Failed to generate quote')
    } finally {
      setGenerating(null)
      setJobSelecting(null)
      setSelectedJobId('')
    }
  }

  if (estimates.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed rounded-lg">
        <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground mb-4">No estimates yet</p>
        <Link
          href={`/projects/${projectSlug}/estimates/new`}
          className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" /> New Estimate
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Estimates</h3>
        <Link
          href={`/projects/${projectSlug}/estimates/new`}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Plus className="w-3 h-3" /> New
        </Link>
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{error}</div>
      )}

      {estimates.map(est => {
        const cost = estimateCost(est)
        const isGenerating = generating === est.id
        return (
          <div key={est.id} className="border rounded-lg hover:bg-accent/20 transition-colors">
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{est.title}</span>
                  {est.version > 1 && (
                    <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                      <GitBranch className="w-3 h-3" /> v{est.version}
                    </span>
                  )}
                  <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', STATUS_STYLES[est.status])}>
                    {est.status.toLowerCase()}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {est.sections.length} section{est.sections.length !== 1 ? 's' : ''} ·{' '}
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: est.currency }).format(cost)}
                  {(est._count?.quotes ?? 0) > 0 && ` · ${est._count!.quotes} quote${est._count!.quotes > 1 ? 's' : ''}`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDuplicate(est.id)}
                  disabled={!!duplicating}
                  title="Use as template for a new estimate"
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border hover:bg-accent disabled:opacity-50 text-muted-foreground"
                >
                  {duplicating === est.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
                </button>
                {est.status === 'FINAL' && jobSelecting !== est.id && (
                  <button
                    onClick={() => { setJobSelecting(est.id); setSelectedJobId(jobs[0]?.id ?? '') }}
                    disabled={!!generating}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border hover:bg-accent disabled:opacity-50"
                  >
                    Generate Quote
                  </button>
                )}
                {est.status === 'FINAL' && jobSelecting === est.id && (
                  <div className="flex items-center gap-1.5">
                    <JobSelect
                      value={selectedJobId}
                      onChange={setSelectedJobId}
                      jobs={jobs}
                      projectId={projectId}
                      required
                      className="text-xs"
                    />
                    <button
                      onClick={() => handleGenerateQuote(est.id, selectedJobId)}
                      disabled={isGenerating || !selectedJobId}
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded border bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Go'}
                    </button>
                    <button
                      onClick={() => { setJobSelecting(null); setSelectedJobId('') }}
                      className="text-xs text-muted-foreground hover:text-foreground px-1"
                    >
                      ✕
                    </button>
                  </div>
                )}
                <Link
                  href={`/projects/${projectSlug}/estimates/${est.id}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
