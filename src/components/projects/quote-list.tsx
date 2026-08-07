'use client'

import { useState, useMemo, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Search, X, Download, Eye, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { QUOTE_STATUS_STYLES } from './quote-status'
import { stashPendingMarkSentQuote } from '@/lib/pending-mark-sent'

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
  projectId: string
  projectSlug: string
  quotes: QuoteItem[]
}

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

type Tab = 'open' | 'accepted' | 'all'

const TABS: { key: Tab; label: (open: number, accepted: number) => string }[] = [
  { key: 'open', label: (open) => `Open (${open})` },
  { key: 'accepted', label: (_open, accepted) => `Accepted (${accepted})` },
  { key: 'all', label: () => 'All' },
]

export function QuoteList({ projectId, projectSlug, quotes }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('open')
  const [search, setSearch] = useState('')

  const openQuotes = useMemo(() => quotes.filter(q => q.status === 'DRAFT' || q.status === 'SENT'), [quotes])
  const acceptedQuotes = useMemo(() => quotes.filter(q => q.status === 'ACCEPTED' || q.status === 'AMENDED'), [quotes])

  const filtered = useMemo(() => {
    let list = quotes
    if (tab === 'open') list = openQuotes
    if (tab === 'accepted') list = acceptedQuotes
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(i =>
        i.quoteNumber.toLowerCase().includes(q) ||
        i.title.toLowerCase().includes(q) ||
        (i.job?.name ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [quotes, tab, search, openQuotes, acceptedQuotes])

  const sumAmt = (arr: QuoteItem[]) => arr.reduce((s, q) => s + (q.totalQuoted ?? 0), 0)
  const currency = quotes[0]?.currency ?? 'USD'

  const handleDownload = useCallback((quote: QuoteItem) => {
    const a = document.createElement('a')
    a.href = `/api/projects/${projectId}/quotes/${quote.id}/pdf`
    a.download = `${quote.quoteNumber}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)

    if (quote.status === 'DRAFT') {
      stashPendingMarkSentQuote({
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
        projectId,
        projectSlug,
        downloadedAt: Date.now(),
      })
    }
  }, [projectId, projectSlug])

  // Empty state
  if (quotes.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1" />
          <Link
            href={`/projects/${projectSlug}/quotes/new`}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New quote
          </Link>
        </div>
        <div className="rounded-xl border border-dashed p-10 text-center">
          <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No quotes yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create one from scratch, from a template, or by duplicating a recent quote.
          </p>
          <Link
            href={`/projects/${projectSlug}/quotes/new`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors mt-4"
          >
            <Plus className="h-3.5 w-3.5" />
            Create your first quote
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Pipeline summary strip */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-xl border p-4 bg-muted/20">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Drafts</p>
          <p className="text-lg font-semibold mt-1 tabular-nums">
            {fmt(sumAmt(openQuotes.filter(q => q.status === 'DRAFT')), currency)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {openQuotes.filter(q => q.status === 'DRAFT').length} quote{openQuotes.filter(q => q.status === 'DRAFT').length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="rounded-xl border p-4 bg-muted/20">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Awaiting acceptance</p>
          <p className="text-lg font-semibold mt-1 tabular-nums" style={{ color: '#3b82f6' }}>
            {fmt(sumAmt(openQuotes.filter(q => q.status === 'SENT')), currency)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {openQuotes.filter(q => q.status === 'SENT').length} quote{openQuotes.filter(q => q.status === 'SENT').length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="rounded-xl border p-4 bg-muted/20">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Accepted</p>
          <p className="text-lg font-semibold mt-1 tabular-nums" style={{ color: '#22c55e' }}>
            {fmt(sumAmt(acceptedQuotes), currency)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {acceptedQuotes.length} quote{acceptedQuotes.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* Tabs */}
        <div className="flex rounded-lg border p-0.5 bg-muted/30 gap-0.5">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                tab === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label(openQuotes.length, acceptedQuotes.length)}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search quotes…"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex-1" />

        <Link
          href={`/projects/${projectSlug}/quotes/new`}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New quote
        </Link>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {search ? 'No quotes match your search.' : 'No quotes in this view.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <div className="grid grid-cols-[minmax(130px,auto)_1fr_110px_110px_100px_70px] bg-muted/40 px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            <span>Quote</span>
            <span>Title</span>
            <span className="text-right">Total</span>
            <span>Status</span>
            <span>Created</span>
            <span />
          </div>
          {filtered.map((q, idx) => (
            <div
              key={q.id}
              className={cn(
                'grid grid-cols-[minmax(130px,auto)_1fr_110px_110px_100px_70px] border-t px-4 py-3 items-center hover:bg-muted/10 cursor-pointer transition-colors',
                idx % 2 === 0 ? '' : 'bg-muted/5'
              )}
              onClick={() => router.push(`/projects/${projectSlug}/quotes/${q.id}`)}
            >
              <span className="text-sm font-medium text-primary whitespace-nowrap">
                {q.quoteNumber}
                {q.version > 1 && (
                  <span className="ml-1 text-xs text-muted-foreground">v{q.version}</span>
                )}
                {q.isAmendment && (
                  <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">amendment</span>
                )}
              </span>
              <span className="text-sm text-muted-foreground truncate min-w-0 pr-2">
                {q.title}
                {q.job ? <span className="text-xs"> · {q.job.name}</span> : ''}
              </span>
              <span className="text-sm tabular-nums text-right">
                {q.totalQuoted !== null ? fmt(q.totalQuoted, q.currency) : '—'}
              </span>
              <span>
                <span className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-medium', QUOTE_STATUS_STYLES[q.status] ?? 'bg-gray-100 text-gray-600')}>
                  {q.status.toLowerCase()}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(q.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                <button
                  title="Download PDF"
                  onClick={() => handleDownload(q)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
                <Link
                  href={`/projects/${projectSlug}/quotes/${q.id}`}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="View quote"
                >
                  <Eye className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
