'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Layers, Clock, Sparkles } from 'lucide-react'

interface AcceptedQuote {
  id: string
  quoteNumber: string
  title: string
  totalQuoted: number | null
  currency: string
}

interface Props {
  projectId: string
  projectSlug: string
  clientName: string
  acceptedQuotes: AcceptedQuote[]
  hasTransactions?: boolean
}

export function NewInvoiceShortcuts({ projectId, projectSlug, clientName, acceptedQuotes, hasTransactions = true }: Props) {
  const router = useRouter()
  const [selectedQuoteId, setSelectedQuoteId] = useState('')
  const [creatingFromQuote, setCreatingFromQuote] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fmt = (n: number, currency: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

  async function handleFromQuote() {
    if (!selectedQuoteId) return
    setCreatingFromQuote(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/quotes/${selectedQuoteId}/create-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to create invoice'); return }
      router.push(`/projects/${projectSlug}/invoices/${json.data.id}`)
    } catch {
      setError('Failed to create invoice')
    } finally {
      setCreatingFromQuote(false)
    }
  }

  function handleFromTransactions() {
    sessionStorage.setItem('invoice-ai-prompt', `Create an invoice based on expenses for ${clientName}`)
    window.dispatchEvent(new CustomEvent('invoice-ai-trigger'))
  }

  function handleFromPastInvoice() {
    sessionStorage.setItem('invoice-open-copy-picker', '1')
    window.dispatchEvent(new CustomEvent('invoice-copy-picker-trigger'))
  }

  function handleCreateWithAI() {
    sessionStorage.setItem('invoice-ai-prompt', `Help me create an invoice for ${clientName}`)
    window.dispatchEvent(new CustomEvent('invoice-ai-trigger'))
  }

  return (
    <>
      <style>{`
        @keyframes ai-sheen {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .ai-sheen-btn {
          background: linear-gradient(
            105deg,
            #b8860b 0%,
            #d4a017 30%,
            #ffd700 48%,
            #fffacd 52%,
            #ffd700 56%,
            #d4a017 70%,
            #b8860b 100%
          );
          background-size: 300% 100%;
          animation: ai-sheen 3.5s ease-in-out 0.8s 1 forwards;
        }
      `}</style>
      <div className="mb-6 space-y-2">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Quick create</p>
        <div className="flex flex-wrap items-center gap-2">

          {/* Create with AI — gold shimmer */}
          <button
            onClick={handleCreateWithAI}
            className="ai-sheen-btn flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-bold text-amber-950 shadow-sm hover:brightness-110 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            Create with AI
          </button>

          {/* From accepted quote — dropdown + go button */}
          {acceptedQuotes.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-green-700 shrink-0" />
              <select
                value={selectedQuoteId}
                onChange={e => setSelectedQuoteId(e.target.value)}
                className="text-xs border border-green-200 bg-green-50 text-green-800 rounded-lg px-2 py-1.5 focus:outline-none"
              >
                <option value="">From accepted quote…</option>
                {acceptedQuotes.map(q => (
                  <option key={q.id} value={q.id}>
                    {q.quoteNumber}{q.totalQuoted ? ` · ${fmt(q.totalQuoted, q.currency)}` : ''}
                  </option>
                ))}
              </select>
              {selectedQuoteId && (
                <button
                  onClick={handleFromQuote}
                  disabled={creatingFromQuote}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-green-700 text-white hover:bg-green-800 disabled:opacity-50 transition-colors"
                >
                  {creatingFromQuote ? '…' : 'Create'}
                </button>
              )}
            </div>
          ) : (
            <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-dashed text-muted-foreground">
              <FileText className="w-3.5 h-3.5 shrink-0" />
              No accepted quotes
            </span>
          )}

          {/* From transactions via invoice AI */}
          {hasTransactions ? (
            <button
              onClick={handleFromTransactions}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100 transition-colors"
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              From transactions
            </button>
          ) : (
            <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-muted-foreground/20 text-muted-foreground/50 cursor-not-allowed select-none" title="No transactions imported yet">
              <Layers className="w-3.5 h-3.5 shrink-0" />
              From transactions
            </span>
          )}

          {/* From past invoice */}
          <button
            onClick={handleFromPastInvoice}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-muted-foreground/30 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Clock className="w-3.5 h-3.5 shrink-0" />
            Start from past invoice
          </button>

        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </>
  )
}
