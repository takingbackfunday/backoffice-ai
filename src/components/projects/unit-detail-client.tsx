'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  UNIT_STATUS_LABELS, UNIT_STATUS_COLORS, LEASE_STATUS_LABELS, LEASE_STATUS_COLORS,
  MAINTENANCE_PRIORITY_COLORS, MAINTENANCE_PRIORITY_LABELS, MAINTENANCE_STATUS_LABELS,
  CHARGE_TYPE_LABELS, CHARGE_TYPE_COLORS,
} from '@/types'
import { cn } from '@/lib/utils'
import { MessageThread } from './message-thread'
import { CheckCircle2, CheckCircle, Clock, Plus, X, Mail } from 'lucide-react'

interface Tenant {
  id: string; name: string; email: string; phone: string | null
  portalInviteStatus: string; clerkUserId: string | null
}
interface TenantCharge {
  id: string; type: string; description: string | null; amount: number;
  dueDate: string; forgivenAt: string | null; forgivenReason: string | null;
  maintenanceRequest: { id: string; title: string } | null
}
interface TenantPayment {
  id: string; amount: number; paidDate: string; paymentMethod: string | null; notes: string | null;
  transaction: { id: string; description: string; date: string; amount: number } | null
}
interface Lease {
  id: string; status: string; startDate: string; endDate: string;
  monthlyRent: number; securityDeposit: number | null; paymentDueDay: number;
  lateFeeAmount: number | null; lateFeeGraceDays: number;
  tenant: Tenant
  tenantCharges: TenantCharge[]
  tenantPayments: TenantPayment[]
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

/* ------------------------------------------------------------------ */
/*  Forgive modal                                                       */
/* ------------------------------------------------------------------ */
function ForgivePill({ projectId, unitId, charge, onDone }: {
  projectId: string; unitId: string; charge: TenantCharge; onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(action: 'forgive' | 'unforgive') {
    setLoading(true)
    await fetch(`/api/projects/${projectId}/units/${unitId}/charges/${charge.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action === 'forgive' ? { action: 'forgive', reason } : { action: 'unforgive' }),
    })
    setLoading(false)
    setOpen(false)
    onDone()
  }

  if (charge.forgivenAt) {
    return (
      <button
        onClick={() => submit('unforgive')}
        disabled={loading}
        className="text-[10px] text-muted-foreground hover:text-foreground underline"
        title={`Forgiven: ${charge.forgivenReason ?? 'no reason'}`}
      >
        {loading ? '…' : 'Restore'}
      </button>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[10px] text-amber-700 hover:text-amber-900 underline"
      >
        Forgive
      </button>
    )
  }

  return (
    <div className="mt-1 flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <input
        autoFocus
        type="text"
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="Reason (optional)"
        className="rounded border px-2 py-0.5 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-primary/30"
        onKeyDown={e => { if (e.key === 'Enter') submit('forgive'); if (e.key === 'Escape') setOpen(false) }}
      />
      <button onClick={() => submit('forgive')} disabled={loading} className="text-[10px] text-amber-700 hover:text-amber-900 font-medium">
        {loading ? '…' : 'Confirm'}
      </button>
      <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Record payment modal                                                */
/* ------------------------------------------------------------------ */
function RecordPaymentModal({ projectId, unitId, onClose, onSaved }: {
  projectId: string; unitId: string; onClose: () => void; onSaved: () => void
}) {
  const [amount, setAmount] = useState('')
  const [paidDate, setPaidDate] = useState(new Date().toISOString().split('T')[0])
  const [method, setMethod] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = parseFloat(amount)
    if (isNaN(n) || n <= 0) { setError('Enter a valid amount'); return }
    setSaving(true); setError(null)
    const res = await fetch(`/api/projects/${projectId}/units/${unitId}/payments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: n, paidDate, paymentMethod: method || null, notes: notes || null }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Failed'); return }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 rounded-xl border bg-background shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-sm font-semibold">Record payment</h3>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div>
            <label className="block text-xs font-medium mb-1">Amount *</label>
            <input type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="0.00" autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Date *</label>
            <input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Method</label>
            <input type="text" value={method} onChange={e => setMethod(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="e.g. Zelle, cash, bank transfer" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {saving ? 'Saving…' : 'Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Levy charge modal                                                   */
/* ------------------------------------------------------------------ */
function LevyChargeModal({ projectId, unitId, onClose, onSaved }: {
  projectId: string; unitId: string; onClose: () => void; onSaved: () => void
}) {
  const [type, setType] = useState('MAINTENANCE')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = parseFloat(amount)
    if (isNaN(n) || n <= 0) { setError('Enter a valid amount'); return }
    setSaving(true); setError(null)
    const res = await fetch(`/api/projects/${projectId}/units/${unitId}/charges`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, description: description || null, amount: n, dueDate }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Failed'); return }
    onSaved()
  }

  const LEVY_TYPES = ['MAINTENANCE', 'UTILITY', 'LATE_FEE', 'DEPOSIT', 'OTHER']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 rounded-xl border bg-background shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-sm font-semibold">Levy charge</h3>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div>
            <label className="block text-xs font-medium mb-1">Type</label>
            <div className="flex flex-wrap gap-1.5">
              {LEVY_TYPES.map(t => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={cn('rounded-full px-2.5 py-1 text-xs font-medium transition-all',
                    type === t ? cn(CHARGE_TYPE_COLORS[t], 'ring-2 ring-offset-1 ring-primary/30') : 'border text-muted-foreground hover:bg-muted/50'
                  )}>
                  {CHARGE_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Description {(type === 'MAINTENANCE' || type === 'OTHER') && <span className="text-destructive">*</span>}</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} autoFocus
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="e.g. Plumber repair — 50% share" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Amount *</label>
            <input type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="0.00" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Due date *</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {saving ? 'Saving…' : 'Levy charge'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */
export function UnitDetailClient({ projectId, unit }: Props) {
  const router = useRouter()
  const [levyOpen, setLevyOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
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

  // Ledger totals
  const activeCharges = activeLease?.tenantCharges.filter(c => !c.forgivenAt) ?? []
  const totalCharged = activeCharges.reduce((s, c) => s + Number(c.amount), 0)
  const totalPaid = activeLease?.tenantPayments.reduce((s, p) => s + Number(p.amount), 0) ?? 0
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
              <div className="flex gap-2">
                <button
                  onClick={() => setLevyOpen(true)}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted transition-colors"
                >
                  <Plus className="h-3 w-3" /> Levy charge
                </button>
                <button
                  onClick={() => setPaymentOpen(true)}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <CheckCircle2 className="h-3 w-3" /> Record payment
                </button>
              </div>
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

            {/* Charges table */}
            {activeLease.tenantCharges.length > 0 && (
              <div className="mb-3">
                <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Charges</p>
                <div className="rounded-md border divide-y text-xs">
                  {activeLease.tenantCharges.map(c => (
                    <div key={c.id} className={cn('flex items-start gap-3 px-3 py-2', c.forgivenAt && 'opacity-50')}>
                      <span className="text-muted-foreground w-20 shrink-0">{fmtDate(c.dueDate)}</span>
                      <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium shrink-0', CHARGE_TYPE_COLORS[c.type] ?? 'bg-muted')}>
                        {CHARGE_TYPE_LABELS[c.type] ?? c.type}
                      </span>
                      <span className="flex-1 text-muted-foreground truncate">
                        {c.description ?? '—'}
                        {c.forgivenAt && <span className="ml-1 italic">(forgiven{c.forgivenReason ? `: ${c.forgivenReason}` : ''})</span>}
                      </span>
                      <span className={cn('tabular-nums font-medium shrink-0', c.forgivenAt && 'line-through text-muted-foreground')}>
                        {fmt(Number(c.amount))}
                      </span>
                      <div className="shrink-0 w-16 text-right">
                        <ForgivePill projectId={projectId} unitId={unit.id} charge={c} onDone={refresh} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Payments table */}
            {activeLease.tenantPayments.length > 0 && (
              <div>
                <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Payments received</p>
                <div className="rounded-md border divide-y text-xs">
                  {activeLease.tenantPayments.map(p => (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                      <span className="text-muted-foreground w-20 shrink-0">{fmtDate(p.paidDate)}</span>
                      <span className="flex-1 text-muted-foreground truncate">
                        {p.transaction ? p.transaction.description : (p.paymentMethod ?? 'Manual entry')}
                        {p.notes && <span className="ml-1 italic">· {p.notes}</span>}
                      </span>
                      {p.transaction && (
                        <span className="text-[10px] text-blue-600 bg-blue-50 rounded-full px-1.5 py-0.5 shrink-0">
                          linked tx
                        </span>
                      )}
                      <span className="tabular-nums font-medium text-green-700 shrink-0">{fmt(Number(p.amount))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeLease.tenantCharges.length === 0 && activeLease.tenantPayments.length === 0 && (
              <p className="text-xs text-muted-foreground">No ledger entries yet. Rent charges will appear here once created.</p>
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

      {/* Modals */}
      {levyOpen && (
        <LevyChargeModal
          projectId={projectId}
          unitId={unit.id}
          onClose={() => setLevyOpen(false)}
          onSaved={() => { setLevyOpen(false); refresh() }}
        />
      )}
      {paymentOpen && (
        <RecordPaymentModal
          projectId={projectId}
          unitId={unit.id}
          onClose={() => setPaymentOpen(false)}
          onSaved={() => { setPaymentOpen(false); refresh() }}
        />
      )}
    </div>
  )
}
