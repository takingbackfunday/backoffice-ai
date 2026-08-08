'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { X, GitBranch, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePageContext } from '@/components/chat/page-context-provider'
import { QUOTE_STATUS_STYLES } from './quote-status'
import { QuoteDetailActions } from './quote-detail-actions'
import { QuoteDownloadBanner } from './quote-download-banner'
import { QuoteDetailTable } from './quote-detail-table'
import { QuoteCreateInvoicePanel } from './quote-create-invoice-panel'
import { FulfillmentBar } from './fulfillment-bar'

export interface QuoteLineItem {
  id: string
  description: string
  quantity: number
  unit: string | null
  unitPrice: number
  isOptional: boolean
  hasEstimateLink: boolean
  costBasis: number | null
  marginPercent: number | null
  costRate: number | null
  tags: string[]
}

export interface QuoteSection {
  id: string
  name: string
  sortOrder: number
  items: QuoteLineItem[]
}

interface QuoteDetailData {
  id: string
  quoteNumber: string
  title: string
  status: string
  version: number
  currency: string
  validUntil: string | null
  sentAt: string | null
  sentTo: string | null
  signedAt: string | null
  scopeNotes: string | null
  terms: string | null
  notes: string | null
  paymentSchedule: { milestone: string; percent: number }[] | null
  totalCost: number | null
  totalQuoted: number | null
  isAmendment: boolean
  sections: QuoteSection[]
  estimate: { id: string; title: string; version: number } | null
  job: { id: string; name: string } | null
  clientProfile: { id: string; contactName: string | null; email: string | null; company: string | null }
  previousVersion: { id: string; quoteNumber: string; version: number } | null
  nextVersion: { id: string; quoteNumber: string; version: number } | null
  amendments: { id: string; quoteNumber: string; status: string; totalQuoted: number | null; signedAt: string | null }[]
  _count?: { invoices: number }
}

interface FulfillmentData {
  totalAgreed: number
  amendmentTotal: number
  effectiveTotal: number
  totalInvoiced: number
  totalPaid: number
  totalOutstanding: number
  uninvoicedBalance: number
  invoices: {
    id: string
    invoiceNumber: string
    status: string
    total: number
    paid: number
    issuedAt: string
  }[]
}

interface Props {
  projectId: string
  projectSlug: string
  quote: QuoteDetailData
  fulfillment: FulfillmentData | null
  initialShowSentBanner?: boolean
}

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)
}

export function QuoteDetailClient({ projectId, projectSlug, quote, fulfillment, initialShowSentBanner = false }: Props) {
  usePageContext({ entityType: 'quote', entityId: quote.id, entityName: quote.quoteNumber })
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCreateInvoice, setShowCreateInvoice] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [showSentBanner, setShowSentBanner] = useState(initialShowSentBanner)

  const currency = quote.currency
  const invoicesCount = quote._count?.invoices ?? 0

  async function action(path: string, method = 'POST', body?: object) {
    setLoading(path)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/quotes/${quote.id}/${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Action failed'); return null }
      return json.data
    } catch {
      setError('Action failed')
      return null
    } finally {
      setLoading(null)
    }
  }

  async function handleCreateInvoice(dueDate: string) {
    const result = await action('create-invoice', 'POST', { dueDate })
    if (result) router.push(`/projects/${projectSlug}/invoices/${result.id}`)
  }

  function handleDownloaded() {
    if (quote.status === 'DRAFT') setShowSentBanner(true)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">{quote.quoteNumber}</h2>
            {quote.version > 1 && (
              <span className="flex items-center gap-0.5 text-sm text-muted-foreground">
                <GitBranch className="w-3.5 h-3.5" /> v{quote.version}
              </span>
            )}
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', QUOTE_STATUS_STYLES[quote.status] ?? 'bg-gray-100 text-gray-600')}>
              {quote.status.toLowerCase()}
            </span>
          </div>
          <p className="text-muted-foreground mt-0.5">{quote.title}</p>
          {quote.job && <p className="text-sm text-muted-foreground">Job: {quote.job.name}</p>}
        </div>
        <button
          type="button"
          disabled={previewing}
          onClick={async () => {
            setPreviewing(true)
            try {
              const res = await fetch(`/api/projects/${projectId}/quotes/${quote.id}/pdf`)
              if (!res.ok) return
              const blob = await res.blob()
              setPreviewUrl(URL.createObjectURL(blob))
            } finally { setPreviewing(false) }
          }}
          className="flex items-center gap-1 text-sm px-3 py-1.5 rounded border hover:bg-accent disabled:opacity-50 transition-colors shrink-0"
        >
          {previewing ? 'Loading…' : 'Preview PDF'}
        </button>
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{error}</div>
      )}

      {showSentBanner && quote.status === 'DRAFT' && (
        <QuoteDownloadBanner
          projectId={projectId}
          quoteId={quote.id}
          quoteNumber={quote.quoteNumber}
          clientName={quote.clientProfile.contactName ?? 'your client'}
          onDone={() => { setShowSentBanner(false); router.refresh() }}
        />
      )}

      <QuoteDetailActions
        projectId={projectId}
        projectSlug={projectSlug}
        quote={{
          id: quote.id, quoteNumber: quote.quoteNumber, title: quote.title,
          status: quote.status, version: quote.version, isAmendment: quote.isAmendment,
          clientEmail: quote.clientProfile.email,
        }}
        sections={quote.sections}
        invoicesCount={invoicesCount}
        onAction={action}
        loading={loading}
        onDownloaded={handleDownloaded}
        onCreateInvoice={() => setShowCreateInvoice(true)}
      />

      {showCreateInvoice && (
        <QuoteCreateInvoicePanel
          onCreate={handleCreateInvoice}
          onCancel={() => setShowCreateInvoice(false)}
          loading={loading}
        />
      )}

      {fulfillment && (quote.status === 'ACCEPTED' || quote.status === 'AMENDED') && (
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">Fulfillment</h3>
          <FulfillmentBar
            effectiveTotal={fulfillment.effectiveTotal}
            totalInvoiced={fulfillment.totalInvoiced}
            totalPaid={fulfillment.totalPaid}
            currency={currency}
          />
        </div>
      )}

      {(quote.previousVersion || quote.nextVersion) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {quote.previousVersion && (
            <Link href={`/projects/${projectSlug}/quotes/${quote.previousVersion.id}`} className="hover:text-foreground">
              ← {quote.previousVersion.quoteNumber} v{quote.previousVersion.version}
            </Link>
          )}
          {quote.previousVersion && quote.nextVersion && <span>·</span>}
          {quote.nextVersion && (
            <Link href={`/projects/${projectSlug}/quotes/${quote.nextVersion.id}`} className="hover:text-foreground">
              {quote.nextVersion.quoteNumber} v{quote.nextVersion.version} →
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Client</p>
          <p className="mt-1">{quote.clientProfile.contactName ?? '—'}</p>
          {quote.clientProfile.email && <p className="text-muted-foreground">{quote.clientProfile.email}</p>}
        </div>
        {quote.validUntil && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Valid Until</p>
            <p className="mt-1">{new Date(quote.validUntil).toLocaleDateString()}</p>
          </div>
        )}
        {quote.sentAt && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Sent</p>
            <p className="mt-1">{new Date(quote.sentAt).toLocaleDateString()}</p>
            {quote.sentTo && <p className="text-muted-foreground">{quote.sentTo}</p>}
          </div>
        )}
      </div>

      {quote.scopeNotes && (
        <div className="bg-muted/30 rounded-lg p-4">
          <p className="text-sm whitespace-pre-wrap">{quote.scopeNotes}</p>
        </div>
      )}

      <QuoteDetailTable sections={quote.sections} currency={currency} />

      {quote.paymentSchedule && quote.paymentSchedule.length > 0 && (
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">Payment Schedule</h3>
          <div className="space-y-2">
            {quote.paymentSchedule.map((row, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span>{row.milestone}</span>
                <span className="font-medium">{row.percent}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {quote.terms && (
        <div className="border rounded-lg p-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Terms &amp; Conditions</h3>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{quote.terms}</p>
        </div>
      )}

      {fulfillment && fulfillment.invoices.length > 0 && (
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">Invoices ({fulfillment.invoices.length})</h3>
          <div className="space-y-2">
            {fulfillment.invoices.map(inv => (
              <Link key={inv.id} href={`/projects/${projectSlug}/invoices/${inv.id}`}
                className="flex items-center justify-between text-sm hover:bg-accent/20 rounded px-2 py-1.5">
                <span className="font-medium">{inv.invoiceNumber}</span>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">{fmt(inv.total, currency)}</span>
                  <span className="text-xs text-green-600">Paid {fmt(inv.paid, currency)}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {quote.amendments.length > 0 && (
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">Amendments</h3>
          <div className="space-y-2">
            {quote.amendments.map(a => (
              <Link key={a.id} href={`/projects/${projectSlug}/quotes/${a.id}`}
                className="flex items-center justify-between text-sm hover:bg-accent/20 rounded px-2 py-1.5">
                <span className="font-medium">{a.quoteNumber}</span>
                <div className="flex items-center gap-3">
                  {a.totalQuoted !== null && <span className="text-muted-foreground">{fmt(a.totalQuoted, currency)}</span>}
                  <span className={cn('text-xs px-1.5 py-0.5 rounded-full', QUOTE_STATUS_STYLES[a.status] ?? 'bg-gray-100 text-gray-600')}>
                    {a.status.toLowerCase()}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }}>
          <div className="relative bg-white rounded-xl shadow-2xl overflow-hidden"
            style={{ width: 'min(90vw, 860px)', height: 'min(92vh, 1100px)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b">
              <span className="text-sm font-semibold">Quote preview — {quote.quoteNumber}</span>
              <button type="button"
                onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null) }}
                className="text-muted-foreground hover:text-foreground text-lg leading-none px-1" aria-label="Close">×</button>
            </div>
            <iframe src={previewUrl} className="w-full" style={{ height: 'calc(100% - 45px)', border: 'none' }} title="Quote preview" />
          </div>
        </div>
      )}
    </div>
  )
}
