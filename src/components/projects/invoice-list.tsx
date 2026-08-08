'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Search, X, Download, Eye, FileText } from 'lucide-react'
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS } from '@/types'
import { cn } from '@/lib/utils'
import { toDisplay } from '@/lib/money'
import { stashPendingMarkSentInvoice } from '@/lib/pending-mark-sent'

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
  projectSlug: string
  invoices: Invoice[]
}

const fmt = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)

function invoiceTotal(items: LineItem[]) {
  return items.reduce((s, i) => s + toDisplay(i.quantity) * toDisplay(i.unitPrice), 0)
}

function invoicePaid(payments: InvoicePayment[]) {
  return payments.reduce((s, p) => s + toDisplay(p.amount), 0)
}

function daysUntil(dateStr: string): number {
  return Math.round((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

function getDisplayStatus(inv: Invoice): string {
  if (inv.status === 'SENT' && daysUntil(inv.dueDate) < 0) return 'OVERDUE'
  return inv.status
}

/* ── Aging bar ─────────────────────────────────────────────────────── */
function AgingBar({ invoices }: { invoices: Invoice[] }) {
  const open = invoices.filter(i => ['DRAFT', 'SENT', 'PARTIAL', 'OVERDUE'].includes(getDisplayStatus(i)))
  if (open.length === 0) return null

  const current = open.filter(i => daysUntil(i.dueDate) >= 0)
  const due1_30 = open.filter(i => daysUntil(i.dueDate) < 0 && daysUntil(i.dueDate) >= -30)
  const due31_60 = open.filter(i => daysUntil(i.dueDate) < -30 && daysUntil(i.dueDate) >= -60)
  const due60plus = open.filter(i => daysUntil(i.dueDate) < -60)

  const sumAmt = (arr: Invoice[]) => arr.reduce((s, i) => s + invoiceTotal(i.lineItems) - invoicePaid(i.payments), 0)
  const currency = invoices[0]?.currency ?? 'USD'

  const bands = [
    { label: 'Current', amount: sumAmt(current), color: '#22c55e' },
    { label: '1–30 days', amount: sumAmt(due1_30), color: '#f59e0b' },
    { label: '31–60 days', amount: sumAmt(due31_60), color: '#f97316' },
    { label: '60+ days', amount: sumAmt(due60plus), color: '#ef4444' },
  ].filter(b => b.amount > 0)

  if (bands.length === 0) return null

  const grandTotal = bands.reduce((s, b) => s + b.amount, 0)

  return (
    <div className="mb-5 rounded-xl border p-4 bg-muted/20">
      <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">AR Aging — {fmt(grandTotal, currency)} outstanding</p>
      <div className="flex h-2 rounded-full overflow-hidden gap-0.5 mb-3">
        {bands.map(b => (
          <div key={b.label} style={{ flex: b.amount / grandTotal, background: b.color }} />
        ))}
      </div>
      <div className="flex gap-4 flex-wrap">
        {bands.map(b => (
          <div key={b.label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: b.color }} />
            <span className="text-xs text-muted-foreground">{b.label}</span>
            <span className="text-xs font-semibold tabular-nums">{fmt(b.amount, currency)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Main component ────────────────────────────────────────────────── */
type Tab = 'open' | 'paid' | 'all'

export function InvoiceList({ projectId, projectSlug, invoices }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('open')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    let list = invoices
    if (tab === 'open') list = list.filter(i => !['PAID', 'VOID'].includes(i.status))
    if (tab === 'paid') list = list.filter(i => i.status === 'PAID')
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(i =>
        i.invoiceNumber.toLowerCase().includes(q) ||
        (i.job?.name ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [invoices, tab, search])

  const openCount = invoices.filter(i => !['PAID', 'VOID'].includes(i.status)).length
  const paidCount = invoices.filter(i => i.status === 'PAID').length

  const handleDownload = useCallback((inv: Invoice) => {
    const a = document.createElement('a')
    a.href = `/api/projects/${projectId}/invoices/${inv.id}/pdf`
    a.download = `${inv.invoiceNumber}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)

    if (inv.status === 'DRAFT') {
      stashPendingMarkSentInvoice({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        projectId,
        projectSlug,
        downloadedAt: Date.now(),
      })
    }
  }, [projectId, projectSlug])

  // Empty state
  if (invoices.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1" />
          <Link
            href={`/projects/${projectSlug}/invoices/new`}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New invoice
          </Link>
        </div>
        <div className="rounded-xl border border-dashed p-10 text-center">
          <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No invoices yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create one, download the PDF, and send it with your own email.
          </p>
          <Link
            href={`/projects/${projectSlug}/invoices/new`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors mt-4"
          >
            <Plus className="h-3.5 w-3.5" />
            Create your first invoice
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Aging bar */}
      <AgingBar invoices={invoices} />

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* Tabs */}
        <div className="flex rounded-lg border p-0.5 bg-muted/30 gap-0.5">
          {([['open', `Open (${openCount})`], ['paid', `Paid (${paidCount})`], ['all', 'All']] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search invoices…"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex-1" />

        <Link
          href={`/projects/${projectSlug}/invoices/new`}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New invoice
        </Link>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {search ? 'No invoices match your search.' : 'No invoices in this view.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <div className="grid grid-cols-[minmax(140px,auto)_1fr_110px_110px_130px_90px_70px] bg-muted/40 px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            <span>Invoice</span>
            <span>Job</span>
            <span className="text-right">Total</span>
            <span className="text-right">Balance</span>
            <span>Status</span>
            <span>Due</span>
            <span />
          </div>
          {filtered.map((inv, idx) => {
            const total = invoiceTotal(inv.lineItems)
            const paid = invoicePaid(inv.payments)
            const balance = total - paid
            const displayStatus = getDisplayStatus(inv)
            const days = daysUntil(inv.dueDate)
            const isOverdue = displayStatus === 'OVERDUE'

            return (
              <div
                key={inv.id}
                className={cn(
                  'grid grid-cols-[minmax(140px,auto)_1fr_110px_110px_130px_90px_70px] border-t px-4 py-2 items-center hover:bg-muted/10 cursor-pointer transition-colors',
                  idx % 2 === 0 ? '' : 'bg-muted/5'
                )}
                onClick={() => router.push(`/projects/${projectSlug}/invoices/${inv.id}`)}
              >
                <span className="text-sm font-medium text-primary whitespace-nowrap">{inv.invoiceNumber}</span>
                <span className="text-sm text-muted-foreground truncate min-w-0 pr-2">{inv.job?.name ?? '—'}</span>
                <span className="text-sm tabular-nums text-right">{fmt(total, inv.currency)}</span>
                <span className={cn('text-sm tabular-nums text-right', balance > 0 && isOverdue ? 'text-red-600 font-medium' : '')}>
                  {balance > 0 ? fmt(balance, inv.currency) : <span className="text-green-600 font-medium">Paid</span>}
                </span>
                <span>
                  <span className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-medium', INVOICE_STATUS_COLORS[displayStatus] ?? 'bg-muted text-muted-foreground')}>
                    {INVOICE_STATUS_LABELS[displayStatus] ?? displayStatus}
                  </span>
                </span>
                <span className={cn('text-xs', isOverdue ? 'text-red-600 font-medium' : days <= 7 && days >= 0 ? 'text-amber-600' : 'text-muted-foreground')}>
                  {isOverdue
                    ? `${Math.abs(days)}d ago`
                    : days === 0 ? 'Today'
                    : days > 0 ? `${days}d`
                    : new Date(inv.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                  <button
                    title="Download PDF"
                    onClick={() => handleDownload(inv)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <Link
                    href={`/projects/${projectSlug}/invoices/${inv.id}`}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="View invoice"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
