'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, FileText, ChevronRight, Loader2, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'

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

interface Props {
  projectId: string
  jobId: string
  projectSlug: string
  estimates: Estimate[]
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

export function EstimateList({ projectId, jobId, projectSlug, estimates }: Props) {
  const router = useRouter()
  const [generating, setGenerating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerateQuote(estimateId: string) {
    setGenerating(estimateId)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estimateId }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to generate quote'); return }
      router.push(`/projects/${projectSlug}/quotes/${json.data.id}/generate`)
    } catch {
      setError('Failed to generate quote')
    } finally {
      setGenerating(null)
    }
  }

  if (estimates.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed rounded-lg">
        <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground mb-4">No estimates yet</p>
        <Link
          href={`/projects/${projectSlug}/jobs/${jobId}/estimates/new`}
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
          href={`/projects/${projectSlug}/jobs/${jobId}/estimates/new`}
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
                {est.status === 'FINAL' && (
                  <button
                    onClick={() => handleGenerateQuote(est.id)}
                    disabled={isGenerating}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border hover:bg-accent disabled:opacity-50"
                  >
                    {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    Generate Quote
                  </button>
                )}
                <Link
                  href={`/projects/${projectSlug}/jobs/${jobId}/estimates/${est.id}`}
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
