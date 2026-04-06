'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Layers } from 'lucide-react'
import { useChatStore } from '@/stores/chat-store'

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
}

export function NewInvoiceShortcuts({ projectId, projectSlug, clientName, acceptedQuotes }: Props) {
  const router = useRouter()
  const { openWithMessage } = useChatStore()
  const [creatingFromQuote, setCreatingFromQuote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFromQuote(quoteId: string) {
    setCreatingFromQuote(quoteId)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/quotes/${quoteId}/create-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to create invoice'); return }
      router.push(`/projects/${projectSlug}/invoices/${json.data.id}`)
    } catch {
      setError('Failed to create invoice')
    } finally {
      setCreatingFromQuote(null)
    }
  }

  function handleFromTransactions() {
    openWithMessage(`Create an invoice based on expenses for ${clientName}`)
  }

  const fmt = (n: number, currency: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

  return (
    <div className="mb-6 space-y-2">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Quick create</p>
      <div className="flex flex-wrap gap-2">

        {/* From accepted quote */}
        {acceptedQuotes.length > 0 ? (
          acceptedQuotes.map(q => (
            <button
              key={q.id}
              onClick={() => handleFromQuote(q.id)}
              disabled={creatingFromQuote === q.id}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-green-200 bg-green-50 text-green-800 hover:bg-green-100 disabled:opacity-50 transition-colors"
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              {creatingFromQuote === q.id ? 'Creating…' : (
                <>
                  From {q.quoteNumber}
                  {q.totalQuoted ? ` · ${fmt(q.totalQuoted, q.currency)}` : ''}
                </>
              )}
            </button>
          ))
        ) : (
          <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-dashed text-muted-foreground">
            <FileText className="w-3.5 h-3.5 shrink-0" />
            No accepted quotes
          </span>
        )}

        {/* From transactions via AI */}
        <button
          onClick={handleFromTransactions}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100 transition-colors"
        >
          <Layers className="w-3.5 h-3.5 shrink-0" />
          From transactions
        </button>

      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
