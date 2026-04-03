'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  UNIT_STATUS_LABELS, UNIT_STATUS_COLORS, LEASE_STATUS_LABELS, LEASE_STATUS_COLORS,
  MAINTENANCE_PRIORITY_COLORS, MAINTENANCE_PRIORITY_LABELS, MAINTENANCE_STATUS_LABELS,
  CHARGE_TYPE_LABELS, CHARGE_TYPE_COLORS, INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS,
} from '@/types'
import { cn } from '@/lib/utils'
import { MessageThread } from './message-thread'
import { CheckCircle2, CheckCircle, Clock, Plus, X, Mail, ChevronDown, ChevronRight } from 'lucide-react'

interface Tenant {
  id: string; name: string; email: string; phone: string | null
  portalInviteStatus: string; clerkUserId: string | null
}
interface InvoiceLineItem {
  id: string; description: string; quantity: number; unitPrice: number;
  chargeType: string | null; forgivenAt: string | null; forgivenReason: string | null;
}
interface InvoicePayment {
  id: string; amount: number; paidDate: string; paymentMethod: string | null; notes: string | null;
  voidedAt: string | null; voidReason: string | null; sourceDeleted: boolean;
  transaction: { id: string; description: string } | null
}
interface Invoice {
  id: string; invoiceNumber: string; status: string; period: string | null;
  dueDate: string; lineItems: InvoiceLineItem[]; payments: InvoicePayment[];
}
interface Lease {
  id: string; status: string; startDate: string; endDate: string;
  monthlyRent: number; securityDeposit: number | null; paymentDueDay: number;
  lateFeeAmount: number | null; lateFeeGraceDays: number;
  tenant: Tenant
  invoices: Invoice[]
}
interface MaintenanceRequest {
  id: string; title: string; description: string; priority: string; status: string;
  createdAt: string; scheduledDate: string | null; cost: number | null; vendorName: string | null;
  tenant: Tenant | null
}
interface Message {
  id: string; senderRole: string; subject: string | null; body: string; createdAt: string; isRead: boolean;
  tenant: Tenant
}
interface UnitDetail {
  id: string; unitLabel: string; status: string; bedrooms: number | null;
  bathrooms: number | null; squareFootage: number | null; monthlyRent: number | null;
  leases: Lease[]; maintenanceRequests: MaintenanceRequest[]; messages: Message[]
}

interface Props { projectId: string; unit: UnitDetail }

const UNIT_STATUSES = ['VACANT', 'LEASED', 'NOTICE_GIVEN', 'PREPARING', 'MAINTENANCE', 'LISTED'] as const

const INVITE_LABELS: Record<string, string> = { NONE: 'Not invited', INVITED: 'Invite sent', ACTIVE: 'Portal active' }
const INVITE_COLORS: Record<string, string> = {
  NONE: 'bg-gray-100 text-gray-600',
  INVITED: 'bg-amber-100 text-amber-700',
  ACTIVE: 'bg-green-100 text-green-700',
}

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function invoiceTotals(inv: Invoice) {
  const lineItemTotal = inv.lineItems
    .filter(li => !li.forgivenAt)
    .reduce((s, li) => s + Number(li.quantity) * Number(li.unitPrice), 0)
  const paymentTotal = inv.payments
    .filter(p => !p.voidedAt)
    .reduce((s, p) => s + Number(p.amount), 0)
  return { lineItemTotal, paymentTotal, outstanding: lineItemTotal - paymentTotal }
}

/* ------------------------------------------------------------------ */
/*  Invoice row (expandable)                                            */
/* ------------------------------------------------------------------ */
function InvoiceRow({ inv, projectId, invoiceId, onDone }: {
  inv: Invoice & { lineItemTotal: number; paymentTotal: number; outstanding: number }
  projectId: string; invoiceId: string; onDone: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [forgivingId, setForgivingId] = useState<string | null>(null)
  const [forgiveReason, setForgiveReason] = useState('')
  const [voidingId, setVoidingId] = useState<string | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [loading, setLoading] = useState(false)

  async function forgiveLineItem(lineItemId: string, action: 'forgive' | 'unforgive') {
    setLoading(true)
    await fetch(`/api/projects/${projectId}/invoices/${invoiceId}/line-items/${lineItemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action === 'forgive' ? { action: 'forgive', reason: forgiveReason } : { action: 'unforgive' }),
    })
    setLoading(false)
    setForgivingId(null)
    setForgiveReason('')
    onDone()
  }

  async function voidPayment(paymentId: string, action: 'void' | 'restore') {
    setLoading(true)
    await fetch(`/api/projects/${projectId}/invoices/${invoiceId}/payments/${paymentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action === 'void' ? { action: 'void', reason: voidReason } : { action: 'restore' }),
    })
    setLoading(false)
    setVoidingId(null)
    setVoidReason('')
    onDone()
  }

  return (
    <div className="rounded-md border overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/20 hover:bg-muted/40 transition-colors text-left"
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        <span className="text-xs font-medium">{inv.invoiceNumber}</span>
        {inv.period && <span className="text-[10px] text-muted-foreground">{inv.period}</span>}
        <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', INVOICE_STATUS_COLORS[inv.status] ?? 'bg-muted')}>
          {INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
        </span>
        <span className="text-[10px] text-muted-foreground ml-auto">Due {fmtDate(inv.dueDate)}</span>
        <span className={cn('text-xs font-semibold tabular-nums ml-3', inv.outstanding > 0 ? 'text-amber-800' : 'text-green-700')}>
          {inv.outstanding > 0 ? `${fmt(inv.outstanding)} owed` : inv.outstanding < 0 ? `${fmt(Math.abs(inv.outstanding))} credit` : 'Paid'}
        </span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="divide-y">
          {/* Line items */}
          {inv.lineItems.map(li => (
            <div key={li.id} className="px-3 py-2">
              <div className={cn('flex items-start gap-2 text-xs', li.forgivenAt && 'opacity-60')}>
                {li.chargeType && (
                  <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium shrink-0', CHARGE_TYPE_COLORS[li.chargeType] ?? 'bg-muted')}>
                    {CHARGE_TYPE_LABELS[li.chargeType] ?? li.chargeType}
                  </span>
                )}
                <span className={cn('flex-1 text-muted-foreground', li.forgivenAt && 'line-through')}>
                  {li.description}
                  {li.forgivenAt && <span className="ml-1 not-italic">(forgiven{li.forgivenReason ? `: ${li.forgivenReason}` : ''})</span>}
                </span>
                <span className={cn('tabular-nums font-medium shrink-0', li.forgivenAt && 'line-through text-muted-foreground')}>
                  {fmt(Number(li.quantity) * Number(li.unitPrice))}
                </span>
                <div className="shrink-0 w-16 text-right">
                  {li.forgivenAt ? (
                    <button
                      onClick={() => forgiveLineItem(li.id, 'unforgive')}
                      disabled={loading}
                      className="text-[10px] text-muted-foreground hover:text-foreground underline"
                    >
                      {loading ? '…' : 'Restore'}
                    </button>
                  ) : forgivingId === li.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        type="text"
                        value={forgiveReason}
                        onChange={e => setForgiveReason(e.target.value)}
                        placeholder="Reason"
                        className="rounded border px-1 py-0.5 text-[10px] w-20 focus:outline-none"
                        onKeyDown={e => { if (e.key === 'Enter') forgiveLineItem(li.id, 'forgive'); if (e.key === 'Escape') setForgivingId(null) }}
                      />
                      <button onClick={() => forgiveLineItem(li.id, 'forgive')} disabled={loading} className="text-[10px] text-amber-700 font-medium">
                        {loading ? '…' : 'OK'}
                      </button>
                      <button onClick={() => setForgivingId(null)}><X className="h-3 w-3 text-muted-foreground" /></button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setForgivingId(li.id)}
                      className="text-[10px] text-amber-700 hover:text-amber-900 underline"
                    >
                      Forgive
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Payments */}
          {inv.payments.length > 0 && (
            <div className="bg-green-50/30 divide-y">
              {inv.payments.map(p => (
                <div key={p.id} className={cn('flex flex-wrap items-center gap-2 px-3 py-1.5 text-xs', p.voidedAt && 'bg-red-50/40')}>
                  <CheckCircle2 className={cn('h-3 w-3 shrink-0', p.voidedAt ? 'text-red-400' : 'text-green-600')} />
                  <span className="text-muted-foreground shrink-0">{fmtDate(p.paidDate)}</span>
                  <span className={cn('flex-1 text-muted-foreground truncate', p.voidedAt && 'line-through')}>
                    {p.transaction ? p.transaction.description : (p.paymentMethod ?? 'Manual')}
                    {p.notes && <span className="ml-1 italic">· {p.notes}</span>}
                  </span>
                  {p.voidedAt && (
                    <span className="text-[10px] text-red-700 bg-red-100 rounded-full px-1.5 py-0.5" title={p.voidReason ?? ''}>voided</span>
                  )}
                  {!p.voidedAt && p.sourceDeleted && (
                    <span className="text-[10px] text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5">source deleted</span>
                  )}
                  <span className={cn('tabular-nums font-medium shrink-0', p.voidedAt ? 'text-red-400 line-through' : 'text-green-700')}>
                    −{fmt(Number(p.amount))}
                  </span>
                  <div className="shrink-0">
                    {p.voidedAt ? (
                      <button
                        onClick={() => voidPayment(p.id, 'restore')}
                        disabled={loading}
                        className="text-[10px] text-muted-foreground hover:text-foreground underline"
                      >
                        {loading ? '…' : 'Restore'}
                      </button>
                    ) : voidingId === p.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          type="text"
                          value={voidReason}
                          onChange={e => setVoidReason(e.target.value)}
                          placeholder="Reason"
                          className="rounded border px-1 py-0.5 text-[10px] w-20 focus:outline-none"
                          onKeyDown={e => { if (e.key === 'Enter') voidPayment(p.id, 'void'); if (e.key === 'Escape') setVoidingId(null) }}
                        />
                        <button onClick={() => voidPayment(p.id, 'void')} disabled={loading} className="text-[10px] text-red-600 font-medium">
                          {loading ? '…' : 'OK'}
                        </button>
                        <button onClick={() => setVoidingId(null)}><X className="h-3 w-3 text-muted-foreground" /></button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setVoidingId(p.id)}
                        className="text-[10px] text-red-600 hover:text-red-800 underline"
                      >
                        Void
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Invoice subtotals */}
          <div className="flex items-center gap-4 px-3 py-1.5 bg-muted/10 text-[11px]">
            <span className="text-muted-foreground">Charged: <span className="font-medium text-foreground">{fmt(inv.lineItemTotal)}</span></span>
            <span className="text-muted-foreground">Paid: <span className="font-medium text-green-700">{fmt(inv.paymentTotal)}</span></span>
            <span className={cn('font-medium', inv.outstanding > 0 ? 'text-amber-800' : 'text-green-700')}>
              {inv.outstanding > 0 ? `${fmt(inv.outstanding)} outstanding` : inv.outstanding < 0 ? `${fmt(Math.abs(inv.outstanding))} credit` : 'Settled'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */
export function UnitDetailClient({ projectId, unit }: Props) {
  const router = useRouter()
  const [unitStatus, setUnitStatus] = useState(unit.status)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [inviteStatus, setInviteStatus] = useState(
    unit.leases.find(l => ['ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH'].includes(l.status))?.tenant.portalInviteStatus ?? 'NONE'
  )
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  const activeLease = unit.leases.find(l => ['ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH'].includes(l.status))

  function refresh() { router.refresh() }

  async function updateStatus(newStatus: string) {
    setStatusUpdating(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/units/${unit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) setUnitStatus(newStatus)
    } finally {
      setStatusUpdating(false)
    }
  }

  async function handleInvite() {
    if (!activeLease) return
    setInviting(true)
    setInviteError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/tenants/${activeLease.tenant.id}/invite`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || json.error) { setInviteError(json.error ?? 'Failed to send invite'); return }
      setInviteStatus('INVITED')
    } finally {
      setInviting(false)
    }
  }

  // Ledger totals from invoices
  const invoiceSummaries = (activeLease?.invoices ?? [])
    .filter(inv => inv.status !== 'VOID')
    .map(inv => ({ ...inv, ...invoiceTotals(inv) }))
  const totalCharged = invoiceSummaries.reduce((s, inv) => s + inv.lineItemTotal, 0)
  const totalPaid = invoiceSummaries.reduce((s, inv) => s + inv.paymentTotal, 0)
  const balance = totalCharged - totalPaid

  return (
    <div className="space-y-6">
      {/* Unit header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{unit.unitLabel}</h2>
          <div className="flex items-center gap-2 mt-1">
            {unit.bedrooms !== null && <span className="text-sm text-muted-foreground">{unit.bedrooms} bed</span>}
            {unit.bathrooms !== null && <span className="text-sm text-muted-foreground">{unit.bathrooms} bath</span>}
            {unit.squareFootage && <span className="text-sm text-muted-foreground">{unit.squareFootage} sq ft</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Portal invite */}
          {activeLease && (
            <div className="flex items-center gap-2">
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium flex items-center gap-1', INVITE_COLORS[inviteStatus] ?? 'bg-muted')}>
                {inviteStatus === 'ACTIVE' && <CheckCircle className="h-3 w-3" />}
                {inviteStatus === 'INVITED' && <Clock className="h-3 w-3" />}
                {INVITE_LABELS[inviteStatus] ?? inviteStatus}
              </span>
              {inviteStatus !== 'ACTIVE' && (
                <button
                  type="button"
                  onClick={handleInvite}
                  disabled={inviting}
                  className="flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium hover:bg-muted/50 disabled:opacity-50 transition-colors"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {inviting ? 'Sending…' : inviteStatus === 'INVITED' ? 'Resend invite' : 'Invite to portal'}
                </button>
              )}
            </div>
          )}
          {inviteError && <p className="text-xs text-destructive">{inviteError}</p>}
          {/* Status select */}
          <select
            value={unitStatus}
            onChange={e => updateStatus(e.target.value)}
            disabled={statusUpdating}
            className={cn(
              'rounded-full px-3 py-1 text-sm font-medium border-0 cursor-pointer appearance-none text-center transition-opacity',
              UNIT_STATUS_COLORS[unitStatus] ?? 'bg-muted text-muted-foreground',
              statusUpdating && 'opacity-50'
            )}
            style={{ backgroundImage: 'none' }}
          >
            {UNIT_STATUSES.map(s => <option key={s} value={s}>{UNIT_STATUS_LABELS[s]}</option>)}
          </select>
        </div>
      </div>

      {/* Active lease */}
      {activeLease ? (
        <div className="rounded-lg border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Current lease</h3>
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', LEASE_STATUS_COLORS[activeLease.status] ?? 'bg-muted')}>
              {LEASE_STATUS_LABELS[activeLease.status] ?? activeLease.status}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">Tenant</dt>
            <dd>{activeLease.tenant.name}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd>{activeLease.tenant.email}</dd>
            {activeLease.tenant.phone && (<><dt className="text-muted-foreground">Phone</dt><dd>{activeLease.tenant.phone}</dd></>)}
            <dt className="text-muted-foreground">Rent</dt>
            <dd className="font-medium">{fmt(Number(activeLease.monthlyRent))}/mo</dd>
            <dt className="text-muted-foreground">Lease period</dt>
            <dd>{fmtDate(activeLease.startDate)} — {fmtDate(activeLease.endDate)}</dd>
            {activeLease.securityDeposit && (<><dt className="text-muted-foreground">Security deposit</dt><dd>{fmt(Number(activeLease.securityDeposit))}</dd></>)}
            <dt className="text-muted-foreground">Due day</dt>
            <dd>Day {activeLease.paymentDueDay} of month</dd>
          </dl>

          {/* ---- LEDGER ---- */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ledger</h4>
              <button
                onClick={() => router.push(`/projects/${projectId}/leases/${activeLease.id}`)}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted transition-colors"
              >
                <Plus className="h-3 w-3" /> View / add invoices
              </button>
            </div>

            {/* Balance row */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="rounded-md bg-muted/30 px-3 py-2">
                <p className="text-[10px] text-muted-foreground mb-0.5">Total charged</p>
                <p className="text-sm font-semibold tabular-nums">{fmt(totalCharged)}</p>
              </div>
              <div className="rounded-md bg-muted/30 px-3 py-2">
                <p className="text-[10px] text-muted-foreground mb-0.5">Total paid</p>
                <p className="text-sm font-semibold tabular-nums text-green-700">{fmt(totalPaid)}</p>
              </div>
              <div className={cn('rounded-md px-3 py-2', balance > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200')}>
                <p className="text-[10px] text-muted-foreground mb-0.5">Balance</p>
                <p className={cn('text-sm font-semibold tabular-nums', balance > 0 ? 'text-amber-800' : 'text-green-800')}>
                  {balance > 0 ? `${fmt(balance)} owed` : balance < 0 ? `${fmt(Math.abs(balance))} credit` : 'Current'}
                </p>
              </div>
            </div>

            {/* Invoice list */}
            {invoiceSummaries.length > 0 ? (
              <div className="space-y-2">
                {invoiceSummaries.map(inv => (
                  <InvoiceRow
                    key={inv.id}
                    inv={inv}
                    projectId={projectId}
                    invoiceId={inv.id}
                    onDone={refresh}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No invoices yet. Rent invoices will appear here once created.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          No active lease. Create a lease to get started.
        </div>
      )}

      {/* Maintenance requests */}
      {unit.maintenanceRequests.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Maintenance requests</h3>
          <div className="space-y-2">
            {unit.maintenanceRequests.map(req => (
              <div key={req.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium">{req.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{req.description}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 ml-4">
                    <span className={cn('rounded-full px-1.5 py-0.5 text-xs', MAINTENANCE_PRIORITY_COLORS[req.priority] ?? 'bg-muted')}>
                      {MAINTENANCE_PRIORITY_LABELS[req.priority] ?? req.priority}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {MAINTENANCE_STATUS_LABELS[req.status] ?? req.status}
                    </span>
                  </div>
                </div>
                {req.cost !== null && <p className="text-xs text-muted-foreground mt-1">Cost: {fmt(Number(req.cost))}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {activeLease && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Messages</h3>
          <MessageThread
            projectId={projectId}
            unitId={unit.id}
            tenantId={activeLease.tenant.id}
            tenantName={activeLease.tenant.name}
            initialMessages={unit.messages}
          />
        </div>
      )}
    </div>
  )
}
