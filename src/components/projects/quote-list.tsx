'use client'

import Link from 'next/link'
import { FileText, Plus, ChevronRight, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'

interface QuoteItem {
  id: string
  quoteNumber: string
  title: string
  status: string
  version: number
  currency: string
  totalQuoted: number | null
  isAmendment: boolean
  createdAt: string
  job: { id: string; name: string } | null
}

interface Props {
  projectSlug: string
  quotes: QuoteItem[]
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SENT: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  SUPERSEDED: 'bg-amber-100 text-amber-700',
  AMENDED: 'bg-purple-100 text-purple-700',
}

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

export function QuoteList({ projectSlug, quotes }: Props) {
  if (quotes.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed rounded-lg">
        <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No quotes yet.</p>
        <p className="text-xs text-muted-foreground mt-1">Generate a quote from a finalized estimate on a job.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {quotes.map(q => (
        <Link
          key={q.id}
          href={`/projects/${projectSlug}/quotes/${q.id}`}
          className="flex items-center gap-3 px-4 py-3 border rounded-lg hover:bg-accent/20 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{q.quoteNumber}</span>
              {q.version > 1 && (
                <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                  <GitBranch className="w-3 h-3" /> v{q.version}
                </span>
              )}
              {q.isAmendment && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">amendment</span>
              )}
              <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', STATUS_STYLES[q.status] ?? 'bg-gray-100 text-gray-600')}>
                {q.status.toLowerCase()}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {q.title}
              {q.job ? ` · ${q.job.name}` : ''}
              {q.totalQuoted ? ` · ${fmt(q.totalQuoted, q.currency)}` : ''}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </Link>
      ))}
    </div>
  )
}
