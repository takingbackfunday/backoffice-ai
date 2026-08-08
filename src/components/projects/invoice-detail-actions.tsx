'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Download, Pencil, CheckCircle2, Circle, MoreHorizontal,
  Send, RefreshCw, X, Loader2, ChevronRight, Banknote,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PortalDropdown } from '@/components/ui/portal-dropdown'
import { useOutsideClick } from '@/hooks/use-outside-click'
import { stashPendingMarkSentInvoice } from '@/lib/pending-mark-sent'

/* ------------------------------------------------------------------ */
/*  Props                                                               */
/* ------------------------------------------------------------------ */

export interface InvoiceActionsData {
  id: string
  invoiceNumber: string
  status: string
  currency: string
  clientEmail: string | null
  paidAmount: number
  isReplaced: boolean
}

interface Props {
  projectId: string
  projectSlug: string
  invoice: InvoiceActionsData
  statusMessage?: string | null
  onDownloaded: () => void
  onMarkSent: () => Promise<void>
  onVoid: () => Promise<void>
  onPreview: () => void
  onOpenSend: (isReminder: boolean) => void
  onRecordPayment: () => void
}

const fmt = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)

/* ------------------------------------------------------------------ */
/*  Stepper                                                             */
/* ------------------------------------------------------------------ */

function StatusStepper({ status }: { status: string }) {
  const steps = ['DRAFT', 'SENT', 'PAID'] as const
  const idxMap: Record<string, number> = { DRAFT: 0, SENT: 1, PARTIAL: 1, OVERDUE: 1, PAID: 2 }
  const currentIdx = idxMap[status] ?? -1
  if (currentIdx === -1) return null

  const labels: Record<typeof steps[number], string> = { DRAFT: 'Draft', SENT: 'Sent', PAID: 'Paid' }

  return (
    <div className="flex items-center gap-2 mb-4">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          {i <= currentIdx ? (
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          ) : i === currentIdx + 1 ? (
            <Circle className="w-5 h-5 text-primary font-medium fill-primary/10" />
          ) : (
            <Circle className="w-5 h-5 text-muted-foreground" />
          )}
          <span className={cn(
            'text-xs font-medium',
            i <= currentIdx ? 'text-green-600' : i === currentIdx + 1 ? 'text-primary' : 'text-muted-foreground'
          )}>
            {labels[s]}
          </span>
          {i < steps.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

export function InvoiceDetailActions({ projectId, projectSlug, invoice, statusMessage, onDownloaded, onMarkSent, onVoid, onPreview, onOpenSend, onRecordPayment }: Props) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [showRenegotiateConfirm, setShowRenegotiateConfirm] = useState(false)
  const [renegotiating, setRenegotiating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const menuAnchorRef = useRef<HTMLButtonElement>(null)
  useOutsideClick(
    { current: menuAnchorRef.current?.closest('[data-portal-dropdown]') as HTMLElement | null ?? document.body } as React.RefObject<HTMLElement | null>,
    () => setMenuOpen(false),
    { enabled: menuOpen, ignoreSelector: '[data-portal-dropdown]' }
  )

  const isDraft = invoice.status === 'DRAFT'
  const isOpen = ['SENT', 'PARTIAL', 'OVERDUE'].includes(invoice.status)
  const canRenegotiate = ['DRAFT', 'SENT', 'PARTIAL', 'OVERDUE'].includes(invoice.status) && !invoice.isReplaced
  const canVoid = invoice.status !== 'VOID' && invoice.status !== 'PAID' && invoice.status !== 'DRAFT'

  async function handleDownload() {
    const a = document.createElement('a')
    a.href = `/api/projects/${projectId}/invoices/${invoice.id}/pdf`
    a.download = `${invoice.invoiceNumber}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)

    if (isDraft) {
      stashPendingMarkSentInvoice({ invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, projectId, projectSlug, downloadedAt: Date.now() })
    }
    onDownloaded()
  }

  async function handleMarkSent() {
    setBusy('mark-sent')
    try { await onMarkSent() } finally { setBusy(null) }
  }

  async function handleVoid() {
    if (!confirm('Void this invoice? This cannot be undone.')) return
    setBusy('void')
    try { await onVoid() } finally { setBusy(null) }
  }

  async function handleDelete() {
    if (!confirm('Delete this draft? This cannot be undone.')) return
    setBusy('delete')
    try {
      const res = await fetch(`/api/projects/${projectId}/invoices/${invoice.id}`, { method: 'DELETE' })
      if (res.ok) router.push(`/projects/${projectSlug}/invoices`)
    } finally {
      setBusy(null)
    }
  }

  async function handleRenegotiate() {
    setRenegotiating(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/invoices/${invoice.id}/renegotiate`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to renegotiate'); setRenegotiating(false); return }
      router.push(`/projects/${projectSlug}/invoices/${json.data.id}/edit`)
    } catch {
      setRenegotiating(false)
    }
  }

  return (
    <div className="space-y-3">
      <StatusStepper status={invoice.status} />

      <div className="flex items-center gap-2 flex-wrap">
        {/* Download = hero action at every status */}
        <button type="button" onClick={handleDownload}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
          <Download className="w-3.5 h-3.5" /> Download PDF
        </button>

        {isDraft && (
          <>
            <Link href={`/projects/${projectSlug}/invoices/${invoice.id}/edit`}
              className="flex items-center gap-1 text-sm px-3 py-1.5 rounded border hover:bg-accent">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </Link>
            <button type="button" onClick={handleMarkSent} disabled={busy === 'mark-sent'}
              className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors">
              {busy === 'mark-sent' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Mark as sent
            </button>
          </>
        )}

        {isOpen && (
          <button type="button" onClick={onRecordPayment}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded border hover:bg-accent transition-colors">
            <Banknote className="w-3.5 h-3.5 text-green-600" /> Record payment
          </button>
        )}

        {statusMessage && <span className="text-xs text-green-600">{statusMessage}</span>}

        {/* Overflow menu */}
        <div className="relative">
          <button ref={menuAnchorRef} type="button" onClick={() => setMenuOpen(o => !o)}
            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded border hover:bg-accent" aria-label="More actions">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          <PortalDropdown anchorRef={menuAnchorRef} open={menuOpen} align="right"
            className="min-w-[180px] rounded-xl border bg-background shadow-xl py-1">
            <button type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left"
              onClick={() => { setMenuOpen(false); onPreview() }}>
              Preview PDF
            </button>
            {isDraft && (
              <button type="button" disabled={!invoice.clientEmail}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left disabled:opacity-40 disabled:cursor-not-allowed"
                title={!invoice.clientEmail ? 'Add a client email address to send directly' : ''}
                onClick={() => { setMenuOpen(false); onOpenSend(false) }}>
                <Send className="w-3.5 h-3.5" /> Send by email…
              </button>
            )}
            {isOpen && (
              <button type="button" disabled={!invoice.clientEmail}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left disabled:opacity-40 disabled:cursor-not-allowed"
                title={!invoice.clientEmail ? 'Add a client email address to send directly' : ''}
                onClick={() => { setMenuOpen(false); onOpenSend(true) }}>
                <Send className="w-3.5 h-3.5" /> Send reminder…
              </button>
            )}
            {canRenegotiate && (
              <>
                <div className="my-1 border-t" />
                <button type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left"
                  onClick={() => { setMenuOpen(false); setShowRenegotiateConfirm(true) }}>
                  <RefreshCw className="w-3.5 h-3.5" /> Renegotiate…
                </button>
              </>
            )}
            {(canVoid || isDraft) && <div className="my-1 border-t" />}
            {canVoid && (
              <button type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left text-red-600"
                onClick={() => { setMenuOpen(false); handleVoid() }}>
                <X className="w-3.5 h-3.5" /> Void invoice
              </button>
            )}
            {isDraft && (
              <button type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left text-red-600"
                onClick={() => { setMenuOpen(false); handleDelete() }}>
                <X className="w-3.5 h-3.5" /> Delete
              </button>
            )}
          </PortalDropdown>
        </div>
      </div>

      {/* Renegotiate confirm */}
      {showRenegotiateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-background border shadow-lg p-6 space-y-4">
            <h3 className="text-base font-semibold">Renegotiate {invoice.invoiceNumber}?</h3>
            <p className="text-sm text-muted-foreground">
              This will void <span className="font-medium text-foreground">{invoice.invoiceNumber}</span> and open a new draft with the same line items.
              {invoice.paidAmount > 0 && (
                <> A credit of <span className="font-medium text-foreground">{fmt(invoice.paidAmount, invoice.currency)}</span> will be applied to the new invoice for payments already received.</>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              You can edit the replacement invoice before sending it to the client.
            </p>
            {error && <p className="text-xs text-red-600">{error}</p>}
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
    </div>
  )
}
