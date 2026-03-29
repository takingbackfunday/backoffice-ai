'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { Search, X, ChevronDown, ChevronRight } from 'lucide-react'
import { INVOICE_STATUS_COLORS, INVOICE_STATUS_LABELS } from '@/types'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface Kpis {
  activeClients: number
  openInvoices: number
  totalOutstanding: number
  revenueThisMonth: number
  overdueCount: number
}

interface Invoice {
  id: string
  invoiceNumber: string
  status: string
  issueDate: string
  dueDate: string
  currency: string
  total: number
  paid: number
  jobName: string | null
}

interface Client {
  id: string
  name: string
  slug: string
  company: string | null
  outstanding: number
  currency: string
  invoices: Invoice[]
}

interface Props {
  clients: Client[]
  kpis: Kpis
}

type StatusFilter = 'ALL' | 'DRAFT' | 'SENT' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'VOID'
const STATUS_FILTERS: StatusFilter[] = ['ALL', 'SENT', 'PARTIAL', 'OVERDUE', 'PAID', 'DRAFT', 'VOID']

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const fmt = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

const fmtFull = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)

function getDisplayStatus(inv: Invoice): string {
  if (inv.status === 'SENT' && new Date(inv.dueDate) < new Date()) return 'OVERDUE'
  return inv.status
}

function isOpenStatus(status: string): boolean {
  return ['DRAFT', 'SENT', 'PARTIAL', 'OVERDUE'].includes(status)
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                      */
/* ------------------------------------------------------------------ */

function KpiCard({
  label, value, sub, accent, active, onClick,
}: {
  label: string
  value: string | number
  sub?: string
  accent?: 'red' | 'amber' | 'green'
  active?: boolean
  onClick?: () => void
}) {
  const accentCls = accent === 'red'
    ? 'border-red-200 bg-red-50'
    : accent === 'amber'
      ? 'border-amber-200 bg-amber-50'
      : accent === 'green'
        ? 'border-green-200 bg-green-50'
        : ''
  const valueCls = accent === 'red'
    ? 'text-red-700'
    : accent === 'amber'
      ? 'text-amber-700'
      : accent === 'green'
        ? 'text-green-700'
        : ''

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'rounded-lg border p-3 text-left transition-all',
        accentCls,
        active ? 'ring-2 ring-primary ring-offset-1' : '',
        onClick ? 'hover:shadow-sm cursor-pointer' : 'cursor-default',
      )}
    >
      <p className="text-[11px] text-muted-foreground mb-0.5 uppercase tracking-wider">{label}</p>
      <p className={cn('text-xl font-bold tabular-nums leading-tight', valueCls)}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  Main                                                                */
/* ------------------------------------------------------------------ */

export function StudioClient({ clients, kpis }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedClient, setExpandedClient] = useState<string | null>(null)

  if (clients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm font-medium mb-1">No active clients</p>
        <p className="text-xs text-muted-foreground mb-4">Create a client project and start issuing invoices.</p>
        <Link
          href="/projects/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Add client
        </Link>
      </div>
    )
  }

  // Count per filter across all invoices
  const allInvoices = clients.flatMap(c => c.invoices)
  function filterCount(f: StatusFilter): number {
    if (f === 'ALL') return allInvoices.length
    return allInvoices.filter(inv => getDisplayStatus(inv) === f).length
  }

  const matchesFilter = useCallback((inv: Invoice): boolean => {
    if (statusFilter === 'ALL') return true
    return getDisplayStatus(inv) === statusFilter
  }, [statusFilter])

  const matchesSearch = useCallback((inv: Invoice, client: Client): boolean => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      client.name.toLowerCase().includes(q) ||
      (client.company ?? '').toLowerCase().includes(q) ||
      inv.invoiceNumber.toLowerCase().includes(q) ||
      (inv.jobName ?? '').toLowerCase().includes(q)
    )
  }, [searchQuery])

  // Build flat rows: one per invoice, grouped by client
  type InvoiceRow = { inv: Invoice; client: Client; indexInClient: number; totalInClient: number }
  const flatRows: InvoiceRow[] = []
  for (const client of clients) {
    const filtered = client.invoices.filter(inv => matchesFilter(inv) && matchesSearch(inv, client))
    filtered.forEach((inv, idx) => {
      flatRows.push({ inv, client, indexInClient: idx, totalInClient: filtered.length })
    })
  }

  return (
    <div className="space-y-4">

      {/* KPI bar */}
      <div className="grid grid-cols-5 gap-3">
        <KpiCard label="Active clients" value={kpis.activeClients} />
        <KpiCard label="Open invoices" value={kpis.openInvoices} />
        <KpiCard
          label="Outstanding"
          value={fmt(kpis.totalOutstanding)}
          sub="across all clients"
          accent={kpis.totalOutstanding > 0 ? 'amber' : undefined}
        />
        <KpiCard
          label="Revenue this month"
          value={fmt(kpis.revenueThisMonth)}
          accent="green"
        />
        <KpiCard
          label="Overdue"
          value={kpis.overdueCount}
          accent={kpis.overdueCount > 0 ? 'red' : undefined}
          active={statusFilter === 'OVERDUE'}
          onClick={kpis.overdueCount > 0 ? () => setStatusFilter(statusFilter === 'OVERDUE' ? 'ALL' : 'OVERDUE') : undefined}
        />
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search clients, invoices, jobs…"
            className="w-full rounded-md border pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map(f => {
            const count = filterCount(f)
            if (f !== 'ALL' && count === 0) return null
            const isActive = statusFilter === f
            return (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'border text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
              >
                {f === 'ALL' ? 'All' : INVOICE_STATUS_LABELS[f] ?? f}
                {f !== 'ALL' && (
                  <span className={cn(
                    'rounded-full px-1.5 py-0 text-[10px] min-w-[18px] text-center',
                    isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                  )}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Flat table */}
      {flatRows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">No invoices match your filters.</p>
          <button type="button" onClick={() => { setStatusFilter('ALL'); setSearchQuery('') }} className="text-xs text-primary hover:underline mt-1">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          {/* Sticky header */}
          <div className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm border-b">
            <div className="grid grid-cols-[minmax(160px,2fr)_minmax(80px,1fr)_minmax(120px,1.5fr)_80px_90px_90px_80px] gap-0 px-3 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              <span>Client</span>
              <span>Invoice</span>
              <span>Job</span>
              <span className="text-right">Total</span>
              <span className="text-right">Balance</span>
              <span>Status</span>
              <span>Due</span>
            </div>
          </div>

          {/* Rows */}
          <div>
            {flatRows.map(({ inv, client, indexInClient, totalInClient }, rowIdx) => {
              const isFirstInGroup = indexInClient === 0
              const isMultiInvoice = totalInClient > 1
              const displayStatus = getDisplayStatus(inv)
              const balance = inv.total - inv.paid
              const isOverdue = displayStatus === 'OVERDUE'
              const prevRow = rowIdx > 0 ? flatRows[rowIdx - 1] : null
              const isNewGroup = prevRow && prevRow.client.id !== client.id

              return (
                <div key={inv.id} className={cn(isNewGroup && 'mt-0.5 border-t')}>
                  <div
                    className={cn(
                      'grid grid-cols-[minmax(160px,2fr)_minmax(80px,1fr)_minmax(120px,1.5fr)_80px_90px_90px_80px] gap-0 px-3 py-0 items-stretch border-b last:border-b-0 hover:bg-muted/20 transition-colors',
                      isMultiInvoice && 'border-l-2 border-l-muted',
                      isOverdue && 'bg-red-50/30',
                    )}
                  >
                    {/* Client cell */}
                    <div className="flex items-center gap-2 py-2.5 pr-2 min-w-0">
                      {isFirstInGroup ? (
                        <div className="min-w-0">
                          <Link
                            href={`/projects/${client.slug}`}
                            className="text-sm font-semibold truncate leading-tight hover:text-primary transition-colors block"
                            onClick={e => e.stopPropagation()}
                          >
                            {client.name}
                          </Link>
                          {client.company && (
                            <p className="text-[11px] text-muted-foreground truncate">{client.company}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground pl-1">↳</span>
                      )}
                    </div>

                    {/* Invoice # */}
                    <div className="flex items-center py-2.5">
                      <Link
                        href={`/projects/${client.slug}/invoices/${inv.id}`}
                        className="text-sm text-primary hover:underline font-medium tabular-nums"
                      >
                        {inv.invoiceNumber}
                      </Link>
                    </div>

                    {/* Job */}
                    <div className="flex items-center py-2.5 pr-2 min-w-0">
                      <span className="text-sm text-muted-foreground truncate">
                        {inv.jobName ?? '—'}
                      </span>
                    </div>

                    {/* Total */}
                    <div className="flex items-center justify-end py-2.5">
                      <span className="text-sm tabular-nums">{fmt(inv.total, inv.currency)}</span>
                    </div>

                    {/* Balance */}
                    <div className="flex items-center justify-end py-2.5">
                      <span className={cn(
                        'text-sm tabular-nums',
                        balance > 0 && inv.status !== 'VOID' ? 'text-amber-700 font-medium' : 'text-muted-foreground'
                      )}>
                        {inv.status === 'VOID' ? '—' : balance > 0 ? fmt(balance, inv.currency) : '—'}
                      </span>
                    </div>

                    {/* Status */}
                    <div className="flex items-center py-2.5">
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-medium',
                        INVOICE_STATUS_COLORS[displayStatus] ?? 'bg-muted text-muted-foreground'
                      )}>
                        {INVOICE_STATUS_LABELS[displayStatus] ?? displayStatus}
                      </span>
                    </div>

                    {/* Due */}
                    <div className="flex items-center py-2.5">
                      <span className={cn('text-xs', isOverdue ? 'text-red-600 font-semibold' : 'text-muted-foreground')}>
                        {new Date(inv.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
