'use client'

import { useState, useEffect } from 'react'
import { toDisplay } from '@/lib/money'
import type { InvoiceDetailData } from './invoice-detail-client'

interface InvoicePayment {
  id: string
  amount: number
  paidDate: string
  paymentMethod: string | null
  notes: string | null
  transactionId?: string | null
}

interface Props {
  projectId: string
  invoiceId: string
  status: string
  currency: string
  payments: InvoicePayment[]
  onInvoiceUpdated: (updated: InvoiceDetailData) => void
}

const fmt = (n: number | string, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(n))

export function InvoicePaymentsTable({ projectId, invoiceId, status, currency, payments, onInvoiceUpdated }: Props) {
  const [paymentMenuOpen, setPaymentMenuOpen] = useState<string | null>(null)
  const [refundingId, setRefundingId] = useState<string | null>(null)
  const [movePaymentId, setMovePaymentId] = useState<string | null>(null)
  const [moveInvoices, setMoveInvoices] = useState<{ id: string; invoiceNumber: string; status: string }[]>([])
  const [loadingMoveInvoices, setLoadingMoveInvoices] = useState(false)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Close payment menu on outside click — deferred so the opening click doesn't immediately close it
  useEffect(() => {
    if (!paymentMenuOpen) return
    function handler() { setPaymentMenuOpen(null) }
    const t = setTimeout(() => document.addEventListener('click', handler), 0)
    return () => { clearTimeout(t); document.removeEventListener('click', handler) }
  }, [paymentMenuOpen])

  async function refreshInvoice() {
    const res = await fetch(`/api/projects/${projectId}/invoices/${invoiceId}`)
    if (res.ok) onInvoiceUpdated((await res.json()).data)
  }

  async function handleRefundPayment(paymentId: string) {
    if (!confirm('Remove this payment? This will reopen the invoice balance.')) return
    setRefundingId(paymentId)
    setPaymentMenuOpen(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/invoices/${invoiceId}/payments/${paymentId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to remove payment'); return }
      await refreshInvoice()
    } finally {
      setRefundingId(null)
    }
  }

  async function openMovePicker(paymentId: string) {
    setMovePaymentId(paymentId)
    setPaymentMenuOpen(null)
    if (moveInvoices.length > 0) return
    setLoadingMoveInvoices(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/invoices`)
      if (res.ok) {
        const json = await res.json()
        setMoveInvoices(
          (json.data ?? []).filter(
            (inv: { id: string; status: string }) => inv.id !== invoiceId && inv.status !== 'VOID' && inv.status !== 'PAID'
          )
        )
      }
    } finally {
      setLoadingMoveInvoices(false)
    }
  }

  async function handleMovePayment(paymentId: string, targetInvoiceId: string) {
    setMovingId(paymentId)
    setMovePaymentId(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/invoices/${invoiceId}/payments/${paymentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetInvoiceId }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to move payment'); return }
      await refreshInvoice()
    } finally {
      setMovingId(null)
    }
  }

  return (
    <>
      {error && (
        <div className="mb-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Move-to-invoice picker */}
      {movePaymentId && (
        <div className="mb-3 rounded-lg border overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b">
            <p className="text-xs font-semibold">Move payment to…</p>
            <button type="button" onClick={() => setMovePaymentId(null)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
          </div>
          {loadingMoveInvoices ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">Loading…</p>
          ) : moveInvoices.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">No other open invoices found for this project.</p>
          ) : (
            <div className="divide-y max-h-48 overflow-y-auto">
              {moveInvoices.map(inv => (
                <button
                  key={inv.id}
                  type="button"
                  disabled={movingId === movePaymentId}
                  onClick={() => handleMovePayment(movePaymentId, inv.id)}
                  className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/40 transition-colors text-xs"
                >
                  <span className="font-medium">{inv.invoiceNumber}</span>
                  <span className="text-muted-foreground capitalize">{inv.status.toLowerCase()}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {payments.length === 0 ? (
        <p className="text-xs text-muted-foreground">No payments recorded yet.</p>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-1.5 font-medium">Date</th>
                <th className="text-right px-3 py-1.5 font-medium">Amount</th>
                <th className="text-left px-3 py-1.5 font-medium">Method</th>
                <th className="text-left px-3 py-1.5 font-medium">Notes</th>
                <th className="w-8 px-2 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {payments.map(p => (
                <tr key={p.id} className={refundingId === p.id || movingId === p.id ? 'opacity-50' : ''}>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {new Date(p.paidDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums text-green-700">
                    {fmt(toDisplay(p.amount), currency)}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{p.paymentMethod ?? '—'}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{p.notes ?? '—'}</td>
                  <td className="px-2 py-1.5 relative">
                    {status !== 'VOID' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setPaymentMenuOpen(paymentMenuOpen === p.id ? null : p.id)}
                          className="flex items-center justify-center w-7 h-7 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Payment actions"
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <circle cx="2" cy="8" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="14" cy="8" r="1.5" />
                          </svg>
                        </button>
                        {paymentMenuOpen === p.id && (
                          <div className="absolute right-0 top-8 z-20 w-44 rounded-lg border bg-background shadow-md py-1 text-xs">
                            <button
                              type="button"
                              onClick={() => openMovePicker(p.id)}
                              className="w-full text-left px-3 py-2 hover:bg-muted transition-colors"
                            >
                              Move to invoice…
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRefundPayment(p.id)}
                              className="w-full text-left px-3 py-2 hover:bg-muted text-destructive transition-colors"
                            >
                              Remove payment
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
