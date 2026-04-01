'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Send, Paperclip } from 'lucide-react'
import type { PaymentMethods } from '@/lib/pdf/invoice-pdf'
import { PaymentSummary } from '@/components/projects/payment-summary'

interface Props {
  projectId: string
  invoiceId: string
  invoiceNumber: string
  clientName: string
  clientEmail: string
  total: number
  paid?: number
  balance?: number
  currency: string
  dueDate: string
  paymentMethods: PaymentMethods
  isReminder?: boolean
  onClose: () => void
  onSent: (newStatus: string) => void
}

const fmt = (n: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function defaultMessage(clientName: string, invoiceNumber: string, total: number, paid: number, balance: number, currency: string, dueDate: string, isReminder: boolean) {
  if (isReminder && paid > 0) {
    return `Hi ${clientName},\n\nI wanted to follow up on ${invoiceNumber}. You've paid ${fmt(paid, currency)} so far — the remaining balance of ${fmt(balance, currency)} was due on ${fmtDate(dueDate)}.\n\nPlease find the updated invoice attached. Let me know if you have any questions.\n\nThanks,`
  }
  if (isReminder) {
    return `Hi ${clientName},\n\nI wanted to follow up on ${invoiceNumber} for ${fmt(total, currency)}, which was due on ${fmtDate(dueDate)}.\n\nPlease find the invoice attached. Let me know if you have any questions.\n\nThanks,`
  }
  return `Hi ${clientName},\n\nPlease find your invoice ${invoiceNumber} for ${fmt(total, currency)} attached, due ${fmtDate(dueDate)}.\n\nLet me know if you have any questions.\n\nThanks,`
}


export function SendInvoiceModal({
  projectId, invoiceId, invoiceNumber, clientName, clientEmail,
  total, paid = 0, balance, currency, dueDate, paymentMethods, isReminder = false,
  onClose, onSent,
}: Props) {
  const effectiveBalance = balance ?? total
  const [message, setMessage] = useState(() =>
    defaultMessage(clientName, invoiceNumber, total, paid, effectiveBalance, currency, dueDate, isReminder)
  )
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const readyRef = useRef(false)
  useEffect(() => { readyRef.current = true }, [])

  async function handleSend() {
    setSending(true)
    setError(null)
    try {
      const endpoint = isReminder
        ? `/api/projects/${projectId}/invoices/${invoiceId}/remind`
        : `/api/projects/${projectId}/invoices/${invoiceId}/send`

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? 'Failed to send')
        return
      }
      onSent(json.data?.status ?? (isReminder ? 'SENT' : 'SENT'))
      onClose()
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget && readyRef.current) onClose() }}
    >
      <div className="w-full max-w-lg bg-background rounded-2xl shadow-2xl border overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-muted/20">
          <div>
            <h2 className="font-semibold text-sm">{isReminder ? 'Send reminder' : 'Send invoice'}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">To: {clientName} &lt;{clientEmail}&gt;</p>
            {paid > 0 && (
              <p className="text-xs mt-1 text-amber-700 font-medium">
                Paid: {fmt(paid, currency)} · Balance: {fmt(effectiveBalance, currency)}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">

          {/* Message */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Message
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={6}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
            />
          </div>

          {/* No email warning */}
          {!clientEmail && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              No email address on file for this client. Add one on the project settings page before sending.
            </div>
          )}

          {/* Attachment notice */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Paperclip className="h-3.5 w-3.5" />
            <span>{invoiceNumber}.pdf will be attached automatically</span>
          </div>

          {/* Payment methods preview */}
          <PaymentSummary pm={paymentMethods} />

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t bg-muted/10">
          <button
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !message.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
            {sending ? 'Sending…' : isReminder ? 'Send reminder' : 'Send invoice'}
          </button>
        </div>

      </div>
    </div>
  )
}
