'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Send, Check, X, GitBranch, Plus, FileText, ChevronRight, Loader2 } from 'lucide-react'
import { FulfillmentBar } from './fulfillment-bar'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface QuoteLineItem {
  id: string
  description: string
  quantity: number
  unit: string | null
  unitPrice: number
  isOptional: boolean
  hasEstimateLink: boolean
  costBasis: number | null
  marginPercent: number | null
}

interface QuoteSection {
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
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SENT: 'bg-blue-100 text-blue-700',
  ACCEPTED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  SUPERSEDED: 'bg-amber-100 text-amber-700',
  AMENDED: 'bg-purple-100 text-purple-700',
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export function QuoteDetailClient({ projectId, projectSlug, quote, fulfillment }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCreateInvoice, setShowCreateInvoice] = useState(false)
  const [dueDate, setDueDate] = useState('')

  const currency = quote.currency

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

  async function handleSend() {
    const result = await action('send')
    if (result) router.refresh()
  }

  async function handleAccept() {
    const result = await action('accept')
    if (result) router.refresh()
  }

  async function handleRevise() {
    const result = await action('revise')
    if (result) router.push(`/projects/${projectSlug}/quotes/${result.id}/generate`)
  }

  async function handleCreateInvoice() {
    if (!dueDate) { setError('Due date is required'); return }
    const result = await action('create-invoice', 'POST', { dueDate })
    if (result) router.push(`/projects/${projectSlug}/invoices/${result.id}`)
  }

  const subtotal = quote.sections.reduce((sum, s) =>
    sum + s.items.filter(i => !i.isOptional).reduce((si, i) => si + i.unitPrice * i.quantity, 0),
    0
  )

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
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_STYLES[quote.status] ?? 'bg-gray-100 text-gray-600')}>
              {quote.status.toLowerCase()}
            </span>
          </div>
          <p className="text-muted-foreground mt-0.5">{quote.title}</p>
          {quote.job && <p className="text-sm text-muted-foreground">Job: {quote.job.name}</p>}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {quote.status === 'DRAFT' && (
            <>
              <Link
                href={`/projects/${projectSlug}/quotes/${quote.id}/generate`}
                className="text-sm px-3 py-1.5 rounded border hover:bg-accent"
              >
                Edit
              </Link>
              <button
                onClick={handleSend}
                disabled={loading === 'send'}
                className="flex items-center gap-1 text-sm px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {loading === 'send' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Send
              </button>
            </>
          )}
          {quote.status === 'SENT' && (
            <>
              <button
                onClick={handleRevise}
                disabled={loading === 'revise'}
                className="text-sm px-3 py-1.5 rounded border hover:bg-accent disabled:opacity-50"
              >
                Revise
              </button>
              <button
                onClick={handleAccept}
                disabled={loading === 'accept'}
                className="flex items-center gap-1 text-sm px-3 py-1.5 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                {loading === 'accept' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Mark Accepted
              </button>
            </>
          )}
          {(quote.status === 'ACCEPTED' || quote.status === 'AMENDED') && (
            <button
              onClick={() => setShowCreateInvoice(true)}
              className="flex items-center gap-1 text-sm px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="w-3.5 h-3.5" /> Create Invoice
            </button>
          )}
          <a
            href={`/api/projects/${projectId}/quotes/${quote.id}/pdf`}
            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded border hover:bg-accent"
          >
            <FileText className="w-3.5 h-3.5" /> PDF
          </a>
        </div>
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{error}</div>
      )}

      {/* Create invoice panel */}
      {showCreateInvoice && (
        <div className="border rounded-lg p-4 space-y-3 bg-muted/20">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Create Invoice from Quote</p>
            <button onClick={() => setShowCreateInvoice(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="ml-2 text-sm border rounded px-2 py-1 bg-background"
              />
            </div>
            <button
              onClick={handleCreateInvoice}
              disabled={loading === 'create-invoice'}
              className="text-sm px-4 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {loading === 'create-invoice' ? 'Creating…' : 'Create Invoice'}
            </button>
          </div>
        </div>
      )}

      {/* Fulfillment bar (only for accepted quotes) */}
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

      {/* Version chain */}
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

      {/* Quote details */}
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

      {/* Scope notes */}
      {quote.scopeNotes && (
        <div className="bg-muted/30 rounded-lg p-4">
          <p className="text-sm">{quote.scopeNotes}</p>
        </div>
      )}

      {/* Line items */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Qty</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Unit Price</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {quote.sections.map(section => (
              <>
                {quote.sections.length > 1 && (
                  <tr key={`section-${section.id}`} className="bg-muted/20">
                    <td colSpan={4} className="px-4 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {section.name}
                    </td>
                  </tr>
                )}
                {section.items.map(item => (
                  <tr key={item.id} className={cn(item.isOptional && 'opacity-60')}>
                    <td className="px-4 py-2.5">
                      {item.description}
                      {item.isOptional && <span className="ml-1 text-xs text-muted-foreground">(optional)</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{item.quantity}{item.unit ? ` ${item.unit}` : ''}</td>
                    <td className="px-4 py-2.5 text-right">{fmt(item.unitPrice, currency)}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{fmt(item.unitPrice * item.quantity, currency)}</td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
          <tfoot className="border-t bg-muted/20">
            <tr>
              <td colSpan={3} className="px-4 py-3 text-right font-semibold">Total</td>
              <td className="px-4 py-3 text-right font-semibold">{fmt(subtotal, currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Payment schedule */}
      {quote.paymentSchedule && quote.paymentSchedule.length > 0 && (
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">Payment Schedule</h3>
          <div className="space-y-2">
            {quote.paymentSchedule.map((row, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span>{row.milestone}</span>
                <span className="font-medium">{row.percent}% — {fmt(subtotal * row.percent / 100, currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Terms */}
      {quote.terms && (
        <div className="border rounded-lg p-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Terms &amp; Conditions</h3>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{quote.terms}</p>
        </div>
      )}

      {/* Linked invoices */}
      {fulfillment && fulfillment.invoices.length > 0 && (
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">Invoices ({fulfillment.invoices.length})</h3>
          <div className="space-y-2">
            {fulfillment.invoices.map(inv => (
              <Link
                key={inv.id}
                href={`/projects/${projectSlug}/invoices/${inv.id}`}
                className="flex items-center justify-between text-sm hover:bg-accent/20 rounded px-2 py-1.5"
              >
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

      {/* Amendments */}
      {quote.amendments.length > 0 && (
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">Amendments</h3>
          <div className="space-y-2">
            {quote.amendments.map(a => (
              <Link
                key={a.id}
                href={`/projects/${projectSlug}/quotes/${a.id}`}
                className="flex items-center justify-between text-sm hover:bg-accent/20 rounded px-2 py-1.5"
              >
                <span className="font-medium">{a.quoteNumber}</span>
                <div className="flex items-center gap-3">
                  {a.totalQuoted !== null && <span className="text-muted-foreground">{fmt(a.totalQuoted, currency)}</span>}
                  <span className={cn('text-xs px-1.5 py-0.5 rounded-full', STATUS_STYLES[a.status] ?? 'bg-gray-100 text-gray-600')}>
                    {a.status.toLowerCase()}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
