'use client'

import { useState } from 'react'

export interface PaymentSuggestion {
  id: string
  confidence: string
  reasoning: string
  transaction: { id: string; description: string; date: string; amount: number }
  invoice: { id: string; invoiceNumber: string }
}

/** "Possible invoice payments" banner (unrelated to AI rule suggestions). */
export function PaymentSuggestionsPanel({
  suggestions,
  onReviewed,
  showToast,
}: {
  suggestions: PaymentSuggestion[]
  onReviewed: (id: string) => void
  showToast: (message: string, type?: 'success' | 'error') => void
}) {
  const [open, setOpen] = useState(true)
  const [reviewingId, setReviewingId] = useState<string | null>(null)

  if (suggestions.length === 0) return null

  async function review(suggestionId: string, action: 'accept' | 'dismiss') {
    setReviewingId(suggestionId)
    try {
      const res = await fetch('/api/invoice-payment-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId, action }),
      })
      if (res.ok) {
        onReviewed(suggestionId)
        showToast(action === 'accept' ? 'Payment recorded on invoice' : 'Suggestion dismissed')
      } else {
        showToast('Failed to review suggestion', 'error')
      }
    } finally {
      setReviewingId(null)
    }
  }

  return (
    <div className="rounded-xl border border-green-200 bg-green-50/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-green-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-[13px]">💸</span>
          <div>
            <span className="text-sm font-medium text-green-900">
              {suggestions.length} payment suggestion{suggestions.length !== 1 ? 's' : ''}
            </span>
            <p className="text-[11px] text-muted-foreground mt-0.5">Incoming transactions that may be invoice payments — review and attribute</p>
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-green-700 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-green-200 divide-y divide-green-100">
          {suggestions.map(s => {
            const isReviewing = reviewingId === s.id
            const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
            const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            return (
              <div key={s.id} className="px-4 py-3 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold tabular-nums">{fmt(Number(s.transaction.amount))}</span>
                    <span className="text-xs text-muted-foreground">{fmtDate(s.transaction.date)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${s.confidence === 'high' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                      {s.confidence}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{s.transaction.description}</p>
                  <p className="text-xs text-foreground mt-1">{s.reasoning}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isReviewing}
                    onClick={() => review(s.id, 'accept')}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {isReviewing ? '…' : 'Accept'}
                  </button>
                  <button
                    type="button"
                    disabled={isReviewing}
                    onClick={() => review(s.id, 'dismiss')}
                    className="rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
