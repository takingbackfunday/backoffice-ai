'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Settings } from 'lucide-react'
import { PaymentSummary } from '@/components/projects/payment-summary'
import type { PaymentMethods } from '@/lib/pdf/invoice-pdf'
import { toDisplay } from '@/lib/money'
import { InvoicePaymentsTable } from './invoice-payments-table'
import type { InvoiceDetailData } from './invoice-detail-client'

export interface PaymentSuggestion {
  id: string
  confidence: string
  reasoning: string
  transaction: {
    id: string
    description: string
    date: string
    amount: number
  }
}

interface InvoicePayment {
  id: string
  amount: number
  paidDate: string
  paymentMethod: string | null
  notes: string | null
  transactionId?: string | null
}

interface LinkableTx {
  id: string
  description: string
  date: string
  amount: number
}

interface Props {
  projectId: string
  invoiceId: string
  status: string
  currency: string
  balance: number
  payments: InvoicePayment[]
  paymentMethods: PaymentMethods
  suggestions: PaymentSuggestion[]
  showPaymentForm: boolean
  onShowPaymentFormChange: (show: boolean) => void
  onInvoiceUpdated: (updated: InvoiceDetailData) => void
}

const fmt = (n: number | string, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(n))

export function InvoicePaymentsSection({ projectId, invoiceId, status, currency, balance, payments, paymentMethods, suggestions: initialSuggestions, showPaymentForm, onShowPaymentFormChange, onInvoiceUpdated }: Props) {
  const [suggestions, setSuggestions] = useState<PaymentSuggestion[]>(initialSuggestions)
  const [showLinkPicker, setShowLinkPicker] = useState(false)
  const [linkableTxs, setLinkableTxs] = useState<LinkableTx[]>([])
  const [loadingTxs, setLoadingTxs] = useState(false)
  const [linkedTxId, setLinkedTxId] = useState<string | null>(null)
  const [linkedTxDesc, setLinkedTxDesc] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0])
  const [payMethod, setPayMethod] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function openLinkPicker() {
    setShowLinkPicker(true)
    onShowPaymentFormChange(true)
    if (linkableTxs.length > 0) return
    setLoadingTxs(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/unlinked-transactions`)
      if (res.ok) {
        const json = await res.json()
        setLinkableTxs(json.data ?? [])
      }
    } finally {
      setLoadingTxs(false)
    }
  }

  function selectLinkedTx(tx: LinkableTx) {
    setLinkedTxId(tx.id)
    setLinkedTxDesc(tx.description)
    setPayAmount(String(Number(tx.amount)))
    setPayDate(tx.date.split('T')[0])
    setShowLinkPicker(false)
  }

  function unlinkTx() {
    setLinkedTxId(null)
    setLinkedTxDesc(null)
    setPayAmount('')
  }

  async function handleSuggestion(suggestionId: string, action: 'accept' | 'dismiss') {
    const res = await fetch('/api/invoice-payment-suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suggestionId, action }),
    })
    if (!res.ok) return
    setSuggestions(prev => prev.filter(s => s.id !== suggestionId))
    if (action === 'accept') {
      const refreshRes = await fetch(`/api/projects/${projectId}/invoices/${invoiceId}`)
      if (refreshRes.ok) onInvoiceUpdated((await refreshRes.json()).data)
    }
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!payAmount || !payDate) { setError('Amount and date are required'); return }

    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/projects/${projectId}/invoices/${invoiceId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(payAmount),
          paidDate: payDate,
          paymentMethod: payMethod || undefined,
          notes: payNotes || undefined,
          ...(linkedTxId ? { transactionId: linkedTxId } : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to record payment'); return }

      const refreshRes = await fetch(`/api/projects/${projectId}/invoices/${invoiceId}`)
      if (refreshRes.ok) onInvoiceUpdated((await refreshRes.json()).data)

      setPayAmount('')
      setPayDate(new Date().toISOString().split('T')[0])
      setPayMethod('')
      setPayNotes('')
      setLinkedTxId(null)
      setLinkedTxDesc(null)
      setShowLinkPicker(false)
      setLinkableTxs([])
      onShowPaymentFormChange(false)
    } finally {
      setSaving(false)
    }
  }

  const canRecord = status !== 'VOID' && status !== 'PAID'

  return (
    <div id="payments" className="space-y-3">
      {/* Payment match suggestions */}
      {suggestions.map(s => (
        <div key={s.id} className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-3 py-2 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-semibold text-xs text-blue-900 dark:text-blue-200">Possible payment match</p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
              {fmt(toDisplay(s.transaction.amount), currency)} · {s.transaction.description} · {new Date(s.transaction.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
            <p className="text-xs text-blue-500 dark:text-blue-400 mt-0.5">{s.reasoning}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button type="button" onClick={() => handleSuggestion(s.id, 'accept')} className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 transition-colors">Accept</button>
            <button type="button" onClick={() => handleSuggestion(s.id, 'dismiss')} className="rounded-md border border-blue-300 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:border-blue-700 dark:hover:bg-blue-900/40 transition-colors">Dismiss</button>
          </div>
        </div>
      ))}

      {/* Header row: title + action buttons */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold">Payments</h3>
        {canRecord && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={openLinkPicker} className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              Link transaction
            </button>
            <button type="button" onClick={() => { onShowPaymentFormChange(!showPaymentForm); setShowLinkPicker(false) }} className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
              Record payment
            </button>
          </div>
        )}
      </div>

      {/* Payment info + payments list side by side */}
      <div className="grid grid-cols-2 gap-4 items-start">

        {/* Payment methods info */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted-foreground">Payment info</h3>
            <Link href="/settings#payment-methods" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Settings className="h-3 w-3" /> Payment settings
            </Link>
          </div>
          <PaymentSummary pm={paymentMethods} />
        </div>

        {/* Payments list/form */}
        <div>
          {error && (
            <div className="mb-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          {/* Link transaction picker */}
          {showLinkPicker && (
            <div className="mb-3 rounded-lg border overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b">
                <p className="text-xs font-semibold">Select a transaction to link</p>
                <button type="button" onClick={() => setShowLinkPicker(false)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
              </div>
              {loadingTxs ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">Loading…</p>
              ) : linkableTxs.length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">No unlinked income transactions found for this client.</p>
              ) : (
                <div className="divide-y max-h-48 overflow-y-auto">
                  {linkableTxs.map(tx => (
                    <button
                      key={tx.id}
                      type="button"
                      onClick={() => selectLinkedTx(tx)}
                      className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/40 transition-colors"
                    >
                      <div>
                        <p className="text-xs font-medium">{tx.description}</p>
                        <p className="text-xs text-muted-foreground">{new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                      </div>
                      <span className="text-xs font-semibold text-green-700 tabular-nums ml-4">{fmt(Number(tx.amount), currency)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {showPaymentForm && (
            <form onSubmit={handleRecordPayment} className="mb-4 rounded-lg border p-4 space-y-3">
              {/* Linked transaction chip */}
              {linkedTxDesc && (
                <div className="flex items-center gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs text-blue-800">
                  <span className="font-medium">Linked:</span>
                  <span className="truncate">{linkedTxDesc}</span>
                  <button type="button" onClick={unlinkTx} className="ml-auto shrink-0 text-blue-500 hover:text-blue-700">✕</button>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Amount <span className="text-destructive">*</span></label>
                  <input
                    type="number"
                    value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder={fmt(toDisplay(balance), currency).replace(/[^0-9.]/g, '')}
                    min="0.01"
                    step="0.01"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Date <span className="text-destructive">*</span></label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={e => setPayDate(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Method</label>
                  <input
                    type="text"
                    value={payMethod}
                    onChange={e => setPayMethod(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Bank transfer, PayPal…"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Notes</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={e => setPayNotes(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Optional"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => { onShowPaymentFormChange(false); setError(null) }}
                  className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving…' : 'Record payment'}
                </button>
              </div>
            </form>
          )}

          <InvoicePaymentsTable
            projectId={projectId}
            invoiceId={invoiceId}
            status={status}
            currency={currency}
            payments={payments}
            onInvoiceUpdated={onInvoiceUpdated}
          />
        </div>
      </div>
    </div>
  )
}
