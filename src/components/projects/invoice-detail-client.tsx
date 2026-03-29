'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS } from '@/types'
import { cn } from '@/lib/utils'

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

interface Invoice {
  id: string
  invoiceNumber: string
  status: string
  issueDate: string
  dueDate: string
  currency: string
  notes: string | null
  job: { id: string; name: string } | null
  lineItems: LineItem[]
  payments: InvoicePayment[]
}

interface Props {
  projectId: string
  invoice: Invoice
}

const fmt = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)

export function InvoiceDetailClient({ projectId, invoice: initial }: Props) {
  const router = useRouter()
  const [invoice, setInvoice] = useState<Invoice>(initial)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0])
  const [payMethod, setPayMethod] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      setShowPaymentForm(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
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
          {invoice.status === 'DRAFT' && (
            <button
              type="button"
              onClick={() => updateStatus('SENT')}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Mark as Sent
            </button>
          )}
          {invoice.status !== 'VOID' && invoice.status !== 'PAID' && (
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

      {/* Payments */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Payments</h3>
          {invoice.status !== 'VOID' && invoice.status !== 'PAID' && (
            <button
              type="button"
              onClick={() => setShowPaymentForm(v => !v)}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Record payment
            </button>
          )}
        </div>

        {error && (
          <div className="mb-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {showPaymentForm && (
          <form onSubmit={handleRecordPayment} className="mb-4 rounded-lg border p-4 space-y-3">
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
  )
}
