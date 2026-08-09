'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Download } from 'lucide-react'
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS } from '@/types'
import { cn } from '@/lib/utils'
import { SendInvoiceModal } from '@/components/projects/send-invoice-modal'
import type { PaymentMethods } from '@/lib/pdf/invoice-pdf'
import { usePageContext } from '@/components/chat/page-context-provider'
import { toDisplay, computeInvoiceTotals } from '@/lib/money'
import { InvoiceDownloadBanner } from '@/components/projects/invoice-download-banner'
import { InvoiceDetailActions } from '@/components/projects/invoice-detail-actions'
import { InvoiceDetailTable } from '@/components/projects/invoice-detail-table'
import { InvoicePaymentsSection } from '@/components/projects/invoice-payments-section'
import { InvoiceRenegotiationBanners, type InvoiceHistoryItem } from '@/components/projects/invoice-renegotiation-banners'
import type { PaymentSuggestion } from '@/components/projects/invoice-payments-section'
import { stashPendingMarkSentInvoice, removePendingMarkSentInvoice } from '@/lib/pending-mark-sent'

interface LineItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  isTaxLine?: boolean
}

interface InvoicePayment {
  id: string
  amount: number
  paidDate: string
  paymentMethod: string | null
  notes: string | null
  transactionId?: string | null
}

interface InvoiceRef {
  id: string
  invoiceNumber: string
}

export interface InvoiceDetailData {
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
  quoteId?: string | null
  quote?: { id: string; quoteNumber: string } | null
}

interface Props {
  projectId: string
  projectSlug: string
  invoice: InvoiceDetailData
  paymentMethods: PaymentMethods
  invoicePaymentNote?: string
  suggestions?: PaymentSuggestion[]
  replacesInvoice?: InvoiceRef | null
  replacedBy?: InvoiceRef | null
  historyChain?: InvoiceHistoryItem[]
  initialShowSentBanner?: boolean
}

export function InvoiceDetailClient({ projectId, projectSlug, invoice: initial, paymentMethods, invoicePaymentNote = '', suggestions = [], replacesInvoice, replacedBy, historyChain = [], initialShowSentBanner = false }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [invoice, setInvoice] = useState<InvoiceDetailData>(initial)

  usePageContext({ entityType: 'invoice', entityId: invoice.id, entityName: invoice.invoiceNumber })
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)
  const [sendModalIsReminder, setSendModalIsReminder] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [emailStatus, setEmailStatus] = useState<string | null>(null)
  const [showSentBanner, setShowSentBanner] = useState(initialShowSentBanner)

  // Auto-open send modal when redirected from "Create & Send" (property applicant flow)
  useEffect(() => {
    if (searchParams.get('send') === '1') {
      setShowSendModal(true)
      // Clean up the query param without a full navigation
      router.replace(`/projects/${projectSlug}/invoices/${initial.id}`)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { total, paid, balance } = computeInvoiceTotals(invoice)
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

  function handleDownloaded() {
    if (invoice.status === 'DRAFT') setShowSentBanner(true)
  }

  async function handleMarkSent() {
    await updateStatus('SENT')
    removePendingMarkSentInvoice(invoice.id)
    router.refresh()
  }

  function openSend(isReminder: boolean) {
    setSendModalIsReminder(isReminder)
    setShowSendModal(true)
  }

  function openPaymentForm() {
    setShowPaymentForm(true)
    document.getElementById('payments')?.scrollIntoView({ behavior: 'smooth' })
  }

  async function handlePreview() {
    setPreviewing(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/invoices/${invoice.id}/pdf`)
      if (!res.ok) return
      const blob = await res.blob()
      setPreviewUrl(URL.createObjectURL(blob))
    } finally {
      setPreviewing(false)
    }
  }

  function downloadFromPreview() {
    if (!previewUrl) return
    const a = document.createElement('a')
    a.href = previewUrl
    a.download = `${invoice.invoiceNumber}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    if (invoice.status === 'DRAFT') {
      stashPendingMarkSentInvoice({ invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, projectId, projectSlug, downloadedAt: Date.now() })
    }
    handleDownloaded()
  }

  return (
    <>
    <div className="space-y-6">
      <InvoiceRenegotiationBanners
        projectSlug={projectSlug}
        replacesInvoice={replacesInvoice}
        replacedBy={replacedBy}
        historyChain={historyChain}
      />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">{invoice.invoiceNumber}</h2>
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', INVOICE_STATUS_COLORS[displayStatus] ?? 'bg-muted text-muted-foreground')}>
              {INVOICE_STATUS_LABELS[displayStatus] ?? displayStatus}
            </span>
          </div>
          {invoice.job && <p className="text-sm text-muted-foreground mt-0.5">Job: {invoice.job.name}</p>}
          {invoice.quote && (
            <p className="text-sm text-muted-foreground">
              Quote:{' '}
              <Link
                href={`/projects/${projectSlug}/quotes/${invoice.quote.id}`}
                className="hover:text-foreground underline-offset-2 hover:underline"
              >
                {invoice.quote.quoteNumber} →
              </Link>
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={previewing}
          onClick={handlePreview}
          className="flex items-center gap-1 text-sm px-3 py-1.5 rounded border hover:bg-accent disabled:opacity-50 transition-colors shrink-0"
        >
          {previewing ? 'Loading…' : 'Preview PDF'}
        </button>
      </div>

      {showSentBanner && invoice.status === 'DRAFT' && (
        <InvoiceDownloadBanner
          projectId={projectId}
          projectSlug={projectSlug}
          invoiceId={invoice.id}
          invoiceNumber={invoice.invoiceNumber}
          clientName={invoice.clientName}
          onMarkSent={handleMarkSent}
          onDone={() => { setShowSentBanner(false); router.refresh() }}
        />
      )}

      <InvoiceDetailActions
        projectId={projectId}
        projectSlug={projectSlug}
        invoice={{
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          currency: invoice.currency,
          clientEmail: invoice.clientEmail,
          paidAmount: toDisplay(paid),
          isReplaced: !!replacedBy,
        }}
        statusMessage={emailStatus}
        onDownloaded={handleDownloaded}
        onMarkSent={handleMarkSent}
        onVoid={() => updateStatus('VOID')}
        onPreview={handlePreview}
        onOpenSend={openSend}
        onRecordPayment={openPaymentForm}
      />

      {/* Meta */}
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Client</p>
          <p className="mt-1">{invoice.clientName}</p>
          {invoice.clientEmail && <p className="text-muted-foreground">{invoice.clientEmail}</p>}
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Issued</p>
          <p className="mt-1">{new Date(invoice.issueDate).toLocaleDateString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Due</p>
          <p className={cn('mt-1', isOverdue ? 'text-red-600 font-medium' : '')}>
            {new Date(invoice.dueDate).toLocaleDateString()}
            {isOverdue && ' (overdue)'}
          </p>
        </div>
      </div>

      <InvoiceDetailTable
        lineItems={invoice.lineItems}
        payments={invoice.payments}
        currency={invoice.currency}
        total={toDisplay(total)}
        balance={toDisplay(balance)}
      />

      {/* Notes */}
      {invoice.notes && (
        <div className="bg-muted/30 rounded-lg p-4">
          <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
        </div>
      )}

      {/* Payment instructions */}
      {invoicePaymentNote && (
        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Payment instructions</h3>
            <Link href="/settings#payment-instructions" className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
              Change default text →
            </Link>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoicePaymentNote}</p>
        </div>
      )}

      <InvoicePaymentsSection
        projectId={projectId}
        invoiceId={invoice.id}
        status={invoice.status}
        currency={invoice.currency}
        balance={toDisplay(balance)}
        payments={invoice.payments}
        paymentMethods={paymentMethods}
        suggestions={suggestions}
        showPaymentForm={showPaymentForm}
        onShowPaymentFormChange={setShowPaymentForm}
        onInvoiceUpdated={setInvoice}
      />
    </div>

    {showSendModal && (
      <SendInvoiceModal
        projectId={projectId}
        projectSlug={projectSlug}
        invoiceId={invoice.id}
        invoiceNumber={invoice.invoiceNumber}
        clientName={invoice.clientName}
        clientEmail={invoice.clientEmail || ''}
        total={toDisplay(total)}
        paid={toDisplay(paid)}
        balance={toDisplay(balance)}
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

    {/* PDF Preview Modal */}
    {previewUrl && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }}
      >
        <div
          className="relative bg-white rounded-xl shadow-2xl overflow-hidden"
          style={{ width: 'min(90vw, 860px)', height: 'min(92vh, 1100px)' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b">
            <span className="text-sm font-semibold">Invoice preview — {invoice.invoiceNumber}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={downloadFromPreview}
                className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
              >
                <Download className="h-3 w-3" /> Download
              </button>
              <button
                type="button"
                onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }}
                className="text-muted-foreground hover:text-foreground text-lg leading-none px-1"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>
          <iframe
            src={previewUrl}
            className="w-full"
            style={{ height: 'calc(100% - 45px)', border: 'none' }}
            title="Invoice preview"
          />
        </div>
      </div>
    )}
    </>
  )
}
