'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Pencil, Download, RefreshCw } from 'lucide-react'
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS } from '@/types'
import { cn } from '@/lib/utils'
import { SendInvoiceModal } from '@/components/projects/send-invoice-modal'
import type { PaymentMethods } from '@/lib/pdf/invoice-pdf'

interface Suggestion {
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

interface LineItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
}

interface InvoicePayment {
  id: string
  amount: number
  paidDate: string
  paymentMethod: string | null
  notes: string | null
}

interface InvoiceRef {
  id: string
  invoiceNumber: string
}

interface Invoice {
  id: string
  invoiceNumber: string
  status: string
  issueDate: string
  dueDate: string
  currency: string
  notes: string | null
  job: { id: string; name: string } | null
  clientEmail: string | null
  clientName: string
  lineItems: LineItem[]
  payments: InvoicePayment[]
  replacesInvoice?: InvoiceRef | null
  replacedBy?: InvoiceRef | null
}

interface Props {
  projectId: string
  projectSlug: string
  invoice: Invoice
  paymentMethods: PaymentMethods
  suggestions?: Suggestion[]
  replacesInvoice?: InvoiceRef | null
  replacedBy?: InvoiceRef | null
}

const fmt = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)

export function InvoiceDetailClient({ projectId, projectSlug, invoice: initial, paymentMethods, suggestions: initialSuggestions = [], replacesInvoice, replacedBy }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [invoice, setInvoice] = useState<Invoice>(initial)
  const [suggestions, setSuggestions] = useState<Suggestion[]>(initialSuggestions)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)
  const [sendModalIsReminder, setSendModalIsReminder] = useState(false)
  const [showLinkPicker, setShowLinkPicker] = useState(false)
  const [linkableTxs, setLinkableTxs] = useState<{ id: string; description: string; date: string; amount: number }[]>([])
  const [loadingTxs, setLoadingTxs] = useState(false)
  const [linkedTxId, setLinkedTxId] = useState<string | null>(null)
  const [linkedTxDesc, setLinkedTxDesc] = useState<string | null>(null)

  // Auto-open send modal when redirected from "Create & Send"
  useEffect(() => {
    if (searchParams.get('send') === '1') {
      setShowSendModal(true)
      // Clean up the query param without a full navigation
      router.replace(`/projects/${projectSlug}/invoices/${initial.id}`)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0])
  const [payMethod, setPayMethod] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailStatus, setEmailStatus] = useState<string | null>(null)
  const [showRenegotiateConfirm, setShowRenegotiateConfirm] = useState(false)
  const [renegotiating, setRenegotiating] = useState(false)

  const total = invoice.lineItems.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0)
  const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0)
  const balance = total - paid
  const isOverdue = invoice.status !== 'PAID' && invoice.status !== 'VOID' && new Date(invoice.dueDate) < new Date()
  const displayStatus = isOverdue && invoice.status === 'SENT' ? 'OVERDUE' : invoice.status

  async function updateStatus(status: string) {
    const res = await fetch(`/api/projects/${projectId}/invoices/${invoice.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      const json = await res.json()
      setInvoice(prev => ({ ...prev, ...json.data }))
    }
  }

  async function openLinkPicker() {
    setShowLinkPicker(true)
    setShowPaymentForm(true)
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

  function selectLinkedTx(tx: { id: string; description: string; date: string; amount: number }) {
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
    // Remove suggestion from local state
    setSuggestions(prev => prev.filter(s => s.id !== suggestionId))
    if (action === 'accept') {
      // Refresh invoice to reflect new payment + status
      router.refresh()
    }
  }

  function openSend(isReminder: boolean) {
    setSendModalIsReminder(isReminder)
    setShowSendModal(true)
  }

  async function handleRenegotiate() {
    setRenegotiating(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/invoices/${invoice.id}/renegotiate`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || json.error) { setRenegotiating(false); return }
      router.push(`/projects/${projectSlug}/invoices/${json.data.id}/edit`)
    } catch {
      setRenegotiating(false)
    }
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!payAmount || !payDate) { setError('Amount and date are required'); return }

    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/projects/${projectId}/invoices/${invoice.id}/payments`, {
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

      // Refresh invoice from server to get updated status
      const refreshRes = await fetch(`/api/projects/${projectId}/invoices/${invoice.id}`)
      if (refreshRes.ok) {
        const refreshJson = await refreshRes.json()
        setInvoice(refreshJson.data)
      }

      setPayAmount('')
      setPayDate(new Date().toISOString().split('T')[0])
      setPayMethod('')
      setPayNotes('')
      setLinkedTxId(null)
      setLinkedTxDesc(null)
      setShowLinkPicker(false)
      setLinkableTxs([])
      setShowPaymentForm(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <div className="space-y-6">
      {/* Renegotiation banners */}
      {replacedBy && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <span>⚠ This invoice was voided and replaced by</span>
          <Link href={`/projects/${projectSlug}/invoices/${replacedBy.id}`} className="font-semibold underline underline-offset-2">
            {replacedBy.invoiceNumber} →
          </Link>
        </div>
      )}
      {replacesInvoice && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-4 py-3 text-sm text-blue-800 dark:text-blue-200 flex items-center gap-2">
          <span>This invoice replaces</span>
          <Link href={`/projects/${projectSlug}/invoices/${replacesInvoice.id}`} className="font-semibold underline underline-offset-2">
            {replacesInvoice.invoiceNumber} →
          </Link>
          <span className="text-blue-500 dark:text-blue-400">(voided)</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">{invoice.invoiceNumber}</h2>
            <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', INVOICE_STATUS_COLORS[displayStatus] ?? 'bg-muted text-muted-foreground')}>
              {INVOICE_STATUS_LABELS[displayStatus] ?? displayStatus}
            </span>
          </div>
          {invoice.job && (
            <p className="text-sm text-muted-foreground mt-1">Job: {invoice.job.name}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Edit — only for DRAFT/SENT/PARTIAL */}
          {!['PAID', 'VOID'].includes(invoice.status) && (
            <Link
              href={`/projects/${projectSlug}/invoices/${invoice.id}/edit`}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
            >
              <Pencil className="h-3 w-3" /> Edit
            </Link>
          )}
          {/* Download PDF */}
          <a
            href={`/api/projects/${projectId}/invoices/${invoice.id}/pdf`}
            download
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
          >
            <Download className="h-3 w-3" /> Download PDF
          </a>
          {emailStatus && (
            <span className="text-xs text-green-600">{emailStatus}</span>
          )}
          {invoice.status !== 'VOID' && invoice.status !== 'PAID' && (
            <>
              {invoice.status === 'DRAFT' && (
                <button
                  type="button"
                  onClick={() => openSend(false)}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                >
                  Send invoice
                </button>
              )}
              {(invoice.status === 'SENT' || invoice.status === 'PARTIAL') && (
                <button
                  type="button"
                  onClick={() => openSend(true)}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
                >
                  Send reminder
                </button>
              )}
            </>
          )}
          {['SENT', 'PARTIAL', 'OVERDUE'].includes(invoice.status) && !replacedBy && (
            <button
              type="button"
              onClick={() => setShowRenegotiateConfirm(true)}
              className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <RefreshCw className="h-3 w-3" /> Renegotiate
            </button>
          )}
          {invoice.status === 'DRAFT' && (
            <button
              type="button"
              onClick={async () => {
                if (!confirm('Delete this draft? This cannot be undone.')) return
                const res = await fetch(`/api/projects/${projectId}/invoices/${invoice.id}`, { method: 'DELETE' })
                if (res.ok) router.push(`/projects/${projectSlug}/invoices`)
              }}
              className="rounded-md border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive/70 hover:text-destructive hover:border-destructive hover:bg-destructive/5 transition-colors"
            >
              Delete
            </button>
          )}
          {invoice.status !== 'VOID' && invoice.status !== 'PAID' && invoice.status !== 'DRAFT' && (
            <button
              type="button"
              onClick={() => { if (confirm('Void this invoice? This cannot be undone.')) updateStatus('VOID') }}
              className="rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
            >
              Void
            </button>
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-3 gap-4 rounded-lg border p-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Issue date</p>
          <p>{new Date(invoice.issueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Due date</p>
          <p className={isOverdue ? 'text-red-600 font-medium' : ''}>
            {new Date(invoice.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            {isOverdue && ' (overdue)'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Currency</p>
          <p>{invoice.currency}</p>
        </div>
      </div>

      {/* Line items */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Line items</h3>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Description</th>
                <th className="text-right px-4 py-2 font-medium w-24">Qty</th>
                <th className="text-right px-4 py-2 font-medium w-28">Unit price</th>
                <th className="text-right px-4 py-2 font-medium w-28">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoice.lineItems.map(item => (
                <tr key={item.id}>
                  <td className="px-4 py-2">{item.description}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {Number(item.quantity) % 1 === 0 ? Number(item.quantity) : Number(item.quantity).toFixed(3)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {fmt(Number(item.unitPrice), invoice.currency)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">
                    {fmt(Number(item.quantity) * Number(item.unitPrice), invoice.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-muted/20">
              <tr>
                <td colSpan={3} className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground">Subtotal</td>
                <td className="px-4 py-2 text-right font-semibold tabular-nums">{fmt(total, invoice.currency)}</td>
              </tr>
              {paid > 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-right text-xs font-semibold text-green-700">Amount paid</td>
                  <td className="px-4 py-2 text-right font-semibold text-green-700 tabular-nums">−{fmt(paid, invoice.currency)}</td>
                </tr>
              )}
              <tr className="border-t">
                <td colSpan={3} className="px-4 py-3 text-right text-sm font-bold">Balance due</td>
                <td className={cn('px-4 py-3 text-right text-sm font-bold tabular-nums', balance <= 0 ? 'text-green-700' : '')}>
                  {fmt(balance, invoice.currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Notes */}
      {invoice.notes && (
        <div className="rounded-lg border p-4">
          <h3 className="text-xs font-semibold text-muted-foreground mb-2">Notes</h3>
          <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
        </div>
      )}

      {/* Payment match suggestions */}
      {suggestions.map(s => (
        <div key={s.id} className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 p-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-semibold text-sm text-blue-900 dark:text-blue-200">Possible payment match</p>
            <p className="text-sm text-blue-700 dark:text-blue-300 mt-0.5">
              {fmt(s.transaction.amount, invoice.currency)} · {s.transaction.description} · {new Date(s.transaction.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
            <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">{s.reasoning}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleSuggestion(s.id, 'accept')}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => handleSuggestion(s.id, 'dismiss')}
              className="rounded-md border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:border-blue-700 dark:hover:bg-blue-900/40 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}

      {/* Payments */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Payments</h3>
          {invoice.status !== 'VOID' && invoice.status !== 'PAID' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openLinkPicker}
                className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                Link transaction for payment
              </button>
              <button
                type="button"
                onClick={() => { setShowPaymentForm(v => !v); setShowLinkPicker(false) }}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Record payment
              </button>
            </div>
          )}
        </div>

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
                    <span className="text-xs font-semibold text-green-700 tabular-nums ml-4">{fmt(Number(tx.amount), invoice.currency)}</span>
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
                  placeholder={fmt(balance, invoice.currency).replace(/[^0-9.]/g, '')}
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
                onClick={() => { setShowPaymentForm(false); setError(null) }}
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

        {invoice.payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Date</th>
                  <th className="text-right px-4 py-2 font-medium">Amount</th>
                  <th className="text-left px-4 py-2 font-medium">Method</th>
                  <th className="text-left px-4 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoice.payments.map(p => (
                  <tr key={p.id}>
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(p.paidDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums text-green-700">
                      {fmt(Number(p.amount), invoice.currency)}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{p.paymentMethod ?? '—'}</td>
                    <td className="px-4 py-2 text-muted-foreground">{p.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>

    {showRenegotiateConfirm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-xl bg-background border shadow-lg p-6 space-y-4">
          <h3 className="text-base font-semibold">Renegotiate {invoice.invoiceNumber}?</h3>
          <p className="text-sm text-muted-foreground">
            This will void <span className="font-medium text-foreground">{invoice.invoiceNumber}</span> and open a new draft with the same line items.
            {paid > 0 && (
              <> A credit of <span className="font-medium text-foreground">{fmt(paid, invoice.currency)}</span> will be applied to the new invoice for payments already received.</>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            You can edit the replacement invoice before sending it to the client.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowRenegotiateConfirm(false)}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => { setShowRenegotiateConfirm(false); handleRenegotiate() }}
              disabled={renegotiating}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {renegotiating ? 'Creating…' : 'Void & create replacement →'}
            </button>
          </div>
        </div>
      </div>
    )}

    {showSendModal && (
      <SendInvoiceModal
        projectId={projectId}
        invoiceId={invoice.id}
        invoiceNumber={invoice.invoiceNumber}
        clientName={invoice.clientName}
        clientEmail={invoice.clientEmail || ''}
        total={total}
        paid={paid}
        balance={balance}
        currency={invoice.currency}
        dueDate={invoice.dueDate}
        paymentMethods={paymentMethods}
        isReminder={sendModalIsReminder}
        onClose={() => setShowSendModal(false)}
        onSent={(newStatus) => {
          setInvoice(prev => ({ ...prev, status: newStatus }))
          setEmailStatus(sendModalIsReminder ? 'Reminder sent!' : 'Invoice sent!')
          setTimeout(() => setEmailStatus(null), 4000)
        }}
      />
    )}
    </>
  )
}
