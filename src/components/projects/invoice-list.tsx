'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Search, X, Send, Bell, Eye, Pencil } from 'lucide-react'
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS } from '@/types'
import { cn } from '@/lib/utils'
import { SendInvoiceModal } from '@/components/projects/send-invoice-modal'
import type { PaymentMethods } from '@/lib/pdf/invoice-pdf'

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
  jobs: { id: string; name: string }[]
  invoices: Invoice[]
  paymentMethods: PaymentMethods
  clientEmail?: string
  clientName?: string
}

const fmt = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)

function invoiceTotal(items: LineItem[]) {
  return items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0)
}

function invoicePaid(payments: InvoicePayment[]) {
  return payments.reduce((s, p) => s + Number(p.amount), 0)
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

/* ── Preview modal ─────────────────────────────────────────────────── */
function InvoicePreviewModal({
  inv,
  projectId,
  projectSlug,
  onClose,
  onUpdate,
  onOpenSend,
}: {
  inv: Invoice
  projectId: string
  projectSlug: string
  onClose: () => void
  onUpdate: (updated: Invoice) => void
  onOpenSend: (inv: Invoice, isReminder: boolean) => void
}) {
  const [emailStatus, setEmailStatus] = useState<string | null>(null)

  const total = invoiceTotal(inv.lineItems)
  const paid = invoicePaid(inv.payments)
  const balance = total - paid
  const displayStatus = getDisplayStatus(inv)
  const isOverdue = displayStatus === 'OVERDUE'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-xl bg-background rounded-2xl shadow-2xl border overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-muted/20">
          <div className="flex items-center gap-3">
            <span className="font-bold text-lg">{inv.invoiceNumber}</span>
            <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', INVOICE_STATUS_COLORS[displayStatus] ?? 'bg-muted text-muted-foreground')}>
              {INVOICE_STATUS_LABELS[displayStatus] ?? displayStatus}
            </span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {inv.job && <p className="text-sm text-muted-foreground">Job: {inv.job.name}</p>}

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs text-muted-foreground mb-0.5">Issue date</p>
              <p>{new Date(inv.issueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            </div>
            <div><p className="text-xs text-muted-foreground mb-0.5">Due date</p>
              <p className={isOverdue ? 'text-red-600 font-medium' : ''}>
                {new Date(inv.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>

          {/* Line items */}
          <div className="rounded-lg border overflow-hidden text-sm">
            <div className="grid grid-cols-[1fr_60px_90px_90px] bg-muted/40 px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase">
              <span>Description</span><span className="text-right">Qty</span><span className="text-right">Rate</span><span className="text-right">Total</span>
            </div>
            {inv.lineItems.map(item => (
              <div key={item.id} className="grid grid-cols-[1fr_60px_90px_90px] border-t px-3 py-2 items-center">
                <span className={cn('text-sm', (item as LineItem & {isTaxLine?: boolean}).isTaxLine ? 'text-muted-foreground italic' : '')}>
                  {item.description}
                </span>
                <span className="text-right text-sm tabular-nums text-muted-foreground">{Number(item.quantity)}</span>
                <span className="text-right text-sm tabular-nums text-muted-foreground">{fmt(Number(item.unitPrice), inv.currency)}</span>
                <span className="text-right text-sm tabular-nums font-medium">{fmt(Number(item.quantity) * Number(item.unitPrice), inv.currency)}</span>
              </div>
            ))}
            <div className="border-t px-3 py-2 flex justify-between">
              <span className="text-sm font-bold">Balance due</span>
              <span className="text-sm font-bold tabular-nums">{fmt(balance, inv.currency)}</span>
            </div>
          </div>

          {inv.notes && (
            <div className="rounded-lg bg-muted/30 px-4 py-3 text-xs text-muted-foreground whitespace-pre-wrap">{inv.notes}</div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-2 px-5 py-3 border-t bg-muted/10">
          {emailStatus && <span className="text-xs text-green-600 flex-1">{emailStatus}</span>}
          {!emailStatus && <div className="flex-1" />}
          {inv.status === 'DRAFT' && (
            <Link
              href={`/projects/${projectSlug}/invoices/${inv.id}/edit`}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
              onClick={onClose}
            >
              <Pencil className="h-3 w-3" /> Edit
            </Link>
          )}
          {(inv.status === 'SENT' || inv.status === 'PARTIAL') && (
            <button
              onClick={() => onOpenSend(inv, true)}
              className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 transition-colors"
            >
              <Bell className="h-3 w-3" /> Nudge
            </button>
          )}
          {inv.status === 'DRAFT' && (
            <button
              onClick={() => onOpenSend(inv, false)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              <Send className="h-3 w-3" /> Send
            </button>
          )}
          <Link
            href={`/projects/${projectSlug}/invoices/${inv.id}`}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            onClick={onClose}
          >
            <Eye className="h-3 w-3" /> Open
          </Link>
        </div>
      </div>
    </div>
  )
}

/* ── Main component ────────────────────────────────────────────────── */
type Tab = 'open' | 'paid' | 'all'

export function InvoiceList({ projectId, projectSlug, invoices: initial, paymentMethods, clientEmail = '', clientName = 'Client' }: Props) {
  const router = useRouter()
  const [invoices, setInvoices] = useState<Invoice[]>(initial)
  const [tab, setTab] = useState<Tab>('open')
  const [tabLoading, setTabLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState<Invoice | null>(null)
  const [sendModal, setSendModal] = useState<{ inv: Invoice; isReminder: boolean } | null>(null)

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

  function handleUpdate(updated: Invoice) {
    setInvoices(prev => prev.map(i => i.id === updated.id ? { ...i, ...updated } : i))
    if (preview?.id === updated.id) setPreview({ ...preview, ...updated })
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
              onClick={() => { if (tab !== t) { setTabLoading(true); setTab(t); setTimeout(() => setTabLoading(false), 300) } }}
              className={cn(
                'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tabLoading && tab === t ? <span className="inline-block w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" /> : label}
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

        <button
          type="button"
          onClick={() => router.push(`/projects/${projectSlug}/invoices/new`)}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New invoice
        </button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {search ? 'No invoices match your search.' : tab === 'open' ? 'No open invoices. Create your first invoice above.' : 'No invoices yet.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <div className="grid grid-cols-[110px_1fr_110px_110px_130px_110px_80px] bg-muted/40 px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
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
            const canSend = inv.status === 'DRAFT'
            const canNudge = inv.status === 'SENT' || inv.status === 'PARTIAL'

            return (
              <div
                key={inv.id}
                className={cn(
                  'grid grid-cols-[110px_1fr_110px_110px_130px_110px_80px] border-t px-4 py-3 items-center hover:bg-muted/10 cursor-pointer transition-colors',
                  idx % 2 === 0 ? '' : 'bg-muted/5'
                )}
                onClick={() => setPreview(inv)}
              >
                <span className="text-sm font-medium text-primary">{inv.invoiceNumber}</span>
                <span className="text-sm text-muted-foreground truncate pr-2">{inv.job?.name ?? '—'}</span>
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
                  {canSend && (
                    <button
                      title="Send invoice"
                      onClick={() => setSendModal({ inv, isReminder: false })}
                      className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {canNudge && (
                    <button
                      title="Send reminder"
                      onClick={() => setSendModal({ inv, isReminder: true })}
                      className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors"
                    >
                      <Bell className="h-3.5 w-3.5" />
                    </button>
                  )}
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

      {/* Preview modal */}
      {preview && (
        <InvoicePreviewModal
          inv={preview}
          projectId={projectId}
          projectSlug={projectSlug}
          onClose={() => setPreview(null)}
          onUpdate={handleUpdate}
          onOpenSend={(inv, isReminder) => { setPreview(null); setSendModal({ inv, isReminder }) }}
        />
      )}

      {/* Send modal */}
      {sendModal && (
        <SendInvoiceModal
          projectId={projectId}
          projectSlug={projectSlug}
          invoiceId={sendModal.inv.id}
          invoiceNumber={sendModal.inv.invoiceNumber}
          clientName={clientName}
          clientEmail={clientEmail}
          total={invoiceTotal(sendModal.inv.lineItems)}
          currency={sendModal.inv.currency}
          dueDate={sendModal.inv.dueDate}
          paymentMethods={paymentMethods}
          isReminder={sendModal.isReminder}
          onClose={() => setSendModal(null)}
          onSent={(newStatus) => {
            handleUpdate({ ...sendModal.inv, status: newStatus })
            setSendModal(null)
          }}
        />
      )}
    </div>
  )
}
