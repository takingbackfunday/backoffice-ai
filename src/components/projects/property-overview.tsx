'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Wrench, ChevronDown, ChevronRight, AlertTriangle, Plus, X,
  User, Calendar, DollarSign, MessageSquare, Send, ExternalLink,
  MapPin,
} from 'lucide-react'
import {
  UNIT_STATUS_COLORS, UNIT_STATUS_LABELS,
  MAINTENANCE_PRIORITY_LABELS, MAINTENANCE_PRIORITY_COLORS,
  MAINTENANCE_STATUS_LABELS, LEASE_STATUS_LABELS, LEASE_STATUS_COLORS,
} from '@/types'
import { cn } from '@/lib/utils'
import { useRef, useEffect } from 'react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MaintenanceRequest {
  id: string; title: string; description: string; priority: string;
  status: string; createdAt: string;
  tenant: { id: string; name: string } | null
}

interface TenantCharge {
  id: string; type: string; description: string | null;
  amount: number; dueDate: string; forgivenAt: string | null
}

interface TenantPayment {
  id: string; amount: number; paidDate: string;
  paymentMethod: string | null; notes: string | null
}

interface RecentMessage {
  id: string; subject: string | null; body: string;
  createdAt: string; isRead: boolean; senderRole: string;
  tenant: { id: string; name: string } | null
}

interface Unit {
  id: string; unitLabel: string; status: string;
  monthlyRent: number | null; bedrooms: number | null;
  tenant: { id: string; name: string; email: string; phone: string | null } | null
  leaseId: string | null;
  leaseEndDate: string | null; leaseStartDate: string | null;
  leaseStatus: string | null; leaseMonthlyRent: number | null;
  paymentDueDay: number | null;
  openMaintenance: number; unreadMessages: number;
  maintenanceRequests: MaintenanceRequest[]
  tenantCharges: TenantCharge[]
  tenantPayments: TenantPayment[]
  recentMessages: RecentMessage[]
}

export interface PropertyOverviewProps {
  projectId: string
  slug: string
  address: string | null
  city: string | null
  state: string | null
  propertyType: string | null
  units: Unit[]
  totalTransactions: number
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const fmtFull = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const fmtMonthYear = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })

const fmtRelativeTime = (d: string) => {
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return fmtDate(d)
}

function daysUntil(endDate: string): number {
  return Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function getLeaseUrgency(endDate: string | null): 'critical' | 'warning' | 'soon' | null {
  if (!endDate) return null
  const days = daysUntil(endDate)
  if (days < 0) return null
  if (days <= 30) return 'critical'
  if (days <= 60) return 'warning'
  if (days <= 90) return 'soon'
  return null
}

const URGENCY_STYLES = {
  critical: 'bg-red-50 border-red-200 text-red-700',
  warning: 'bg-amber-50 border-amber-200 text-amber-700',
  soon: 'bg-yellow-50 border-yellow-200 text-yellow-700',
}

const CHARGE_TYPE_COLORS: Record<string, string> = {
  RENT: 'bg-blue-100 text-blue-800',
  LATE_FEE: 'bg-red-100 text-red-800',
  MAINTENANCE: 'bg-orange-100 text-orange-800',
  UTILITY: 'bg-cyan-100 text-cyan-800',
  DEPOSIT: 'bg-purple-100 text-purple-800',
  OTHER: 'bg-gray-100 text-gray-700',
}

const CHARGE_TYPE_LABELS: Record<string, string> = {
  RENT: 'Rent', LATE_FEE: 'Late fee', MAINTENANCE: 'Maint.',
  UTILITY: 'Utility', DEPOSIT: 'Deposit', OTHER: 'Other',
}

const MAINTENANCE_STATUSES = ['OPEN', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const

const UNIT_STATUSES = ['VACANT', 'LEASED', 'NOTICE_GIVEN', 'PREPARING', 'MAINTENANCE', 'LISTED'] as const

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function PropertyOverview({ projectId, slug, address, city, state, propertyType, units, totalTransactions }: PropertyOverviewProps) {
  const router = useRouter()
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(
    () => new Set(units.map(u => u.id))
  )
  const [maintenanceModal, setMaintenanceModal] = useState<{ unitId: string; unitLabel: string } | null>(null)
  const [messageModal, setMessageModal] = useState<{ unitId: string; tenantId: string; tenantName: string; unitLabel: string } | null>(null)
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null)

  function toggleUnit(id: string) {
    setExpandedUnits(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function updateUnitStatus(unitId: string, newStatus: string) {
    setStatusUpdating(unitId)
    try {
      const res = await fetch(`/api/projects/${projectId}/units/${unitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) router.refresh()
    } finally {
      setStatusUpdating(null)
    }
  }

  async function updateMaintenanceStatus(requestId: string, newStatus: string) {
    await fetch(`/api/projects/${projectId}/maintenance/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    router.refresh()
  }

  const leased = units.filter(u => u.status === 'LEASED').length
  const monthlyRevenue = units.filter(u => u.status === 'LEASED' && u.monthlyRent).reduce((s, u) => s + (u.monthlyRent ?? 0), 0)
  const openMaintenance = units.reduce((s, u) => s + u.openMaintenance, 0)
  const unreadMessages = units.reduce((s, u) => s + u.unreadMessages, 0)

  return (
    <div className="space-y-4">
      {/* ---- Compact info bar ---- */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border px-4 py-2.5 text-sm bg-muted/20">
        {(address || city || state) && (
          <span className="flex items-center gap-1 text-muted-foreground text-xs">
            <MapPin className="h-3 w-3 shrink-0" />
            {[address, city, state].filter(Boolean).join(', ')}
          </span>
        )}
        {propertyType && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{propertyType}</span>
        )}
        <span className="text-xs text-muted-foreground">{leased}/{units.length} leased</span>
        {monthlyRevenue > 0 && <span className="text-xs font-medium">{fmt(monthlyRevenue)}/mo</span>}
        {openMaintenance > 0 && (
          <span className="flex items-center gap-1 text-xs text-orange-600">
            <Wrench className="h-3 w-3" />{openMaintenance} open
          </span>
        )}
        {unreadMessages > 0 && (
          <span className="flex items-center gap-1 text-xs text-blue-600">
            <MessageSquare className="h-3 w-3" />{unreadMessages} unread
          </span>
        )}
        <span className="text-xs text-muted-foreground">{totalTransactions} txns</span>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <Link href={`/projects/${slug}/units`} className="text-muted-foreground hover:text-foreground transition-colors">Units</Link>
          <Link href={`/projects/${slug}/leases`} className="text-muted-foreground hover:text-foreground transition-colors">Leases</Link>
          <Link href={`/projects/${slug}/financials`} className="text-muted-foreground hover:text-foreground transition-colors">Financials</Link>
          <Link href={`/projects/${slug}/maintenance`} className="text-muted-foreground hover:text-foreground transition-colors">Maintenance</Link>
          <Link href={`/projects/${slug}/messages`} className="text-muted-foreground hover:text-foreground transition-colors">Messages</Link>
        </div>
      </div>

      {/* ---- Units accordion ---- */}
      {units.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center">
          <p className="text-sm text-muted-foreground">No units yet.</p>
          <Link href={`/projects/${slug}/units`} className="text-xs text-primary hover:underline mt-1 inline-block">
            Add a unit
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <div className="divide-y">
            {units.map(unit => {
              const isExpanded = expandedUnits.has(unit.id)
              const urgency = getLeaseUrgency(unit.leaseEndDate)
              const days = unit.leaseEndDate ? daysUntil(unit.leaseEndDate) : null
              const charged = unit.tenantCharges.filter(c => !c.forgivenAt).reduce((s, c) => s + c.amount, 0)
              const paid = unit.tenantPayments.reduce((s, p) => s + p.amount, 0)
              const balance = charged - paid

              return (
                <div key={unit.id} className={cn(isExpanded && 'bg-muted/10')}>
                  {/* Unit header row */}
                  <div
                    className={cn(
                      'flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors cursor-pointer',
                      urgency === 'critical' && 'bg-red-50/40',
                    )}
                    onClick={() => toggleUnit(unit.id)}
                  >
                    <span className="text-muted-foreground/50 shrink-0">
                      {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </span>
                    <span className="text-sm font-medium min-w-[60px]">{unit.unitLabel}</span>
                    {unit.bedrooms !== null && <span className="text-[11px] text-muted-foreground">{unit.bedrooms}bd</span>}

                    {/* Status dropdown */}
                    <div onClick={e => e.stopPropagation()}>
                      <select
                        value={unit.status}
                        onChange={e => updateUnitStatus(unit.id, e.target.value)}
                        disabled={statusUpdating === unit.id}
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium border-0 cursor-pointer appearance-none text-center',
                          UNIT_STATUS_COLORS[unit.status] ?? 'bg-muted text-muted-foreground',
                          statusUpdating === unit.id && 'opacity-50'
                        )}
                        style={{ backgroundImage: 'none' }}
                      >
                        {UNIT_STATUSES.map(s => <option key={s} value={s}>{UNIT_STATUS_LABELS[s]}</option>)}
                      </select>
                    </div>

                    {unit.tenant && (
                      <span className="flex items-center gap-1 text-sm text-muted-foreground truncate">
                        <User className="h-3 w-3 shrink-0 opacity-50" />
                        {unit.tenant.name}
                      </span>
                    )}

                    <div className="ml-auto flex items-center gap-4 shrink-0">
                      {unit.monthlyRent && (
                        <span className="text-xs font-medium tabular-nums hidden sm:block">{fmt(unit.monthlyRent)}/mo</span>
                      )}
                      {(charged > 0 || paid > 0) && (
                        <span className={cn('text-xs font-medium tabular-nums hidden sm:block', balance > 0 ? 'text-red-600' : 'text-green-600')}>
                          {balance > 0 ? `+${fmt(balance)} owed` : balance < 0 ? `-${fmt(Math.abs(balance))} credit` : 'Clear'}
                        </span>
                      )}
                      {unit.openMaintenance > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-orange-600 font-medium hidden sm:flex">
                          <Wrench className="h-3 w-3" />{unit.openMaintenance}
                        </span>
                      )}
                      {unit.unreadMessages > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-blue-600 font-medium hidden sm:flex">
                          <MessageSquare className="h-3 w-3" />{unit.unreadMessages}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expanded panels */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 ml-6 border-l-2 border-muted">
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

                        {/* ---- LEASE INFO ---- */}
                        <div className="rounded-lg border p-3 space-y-2">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                            <Calendar className="h-3 w-3" /> Lease
                          </h4>
                          {unit.tenant ? (
                            <div className="space-y-1.5 text-sm">
                              <div className="flex justify-between"><span className="text-muted-foreground">Tenant</span><span className="font-medium">{unit.tenant.name}</span></div>
                              {unit.tenant.email && <div className="flex justify-between"><span className="text-muted-foreground">Email</span><a href={`mailto:${unit.tenant.email}`} className="text-primary hover:underline text-xs">{unit.tenant.email}</a></div>}
                              {unit.tenant.phone && <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><a href={`tel:${unit.tenant.phone}`} className="text-primary hover:underline text-xs">{unit.tenant.phone}</a></div>}
                              {unit.leaseStartDate && unit.leaseEndDate && <div className="flex justify-between"><span className="text-muted-foreground">Period</span><span className="text-xs">{fmtDate(unit.leaseStartDate)} — {fmtDate(unit.leaseEndDate)}</span></div>}
                              {unit.leaseStatus && <div className="flex justify-between items-center"><span className="text-muted-foreground">Status</span><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', LEASE_STATUS_COLORS[unit.leaseStatus] ?? 'bg-muted')}>{LEASE_STATUS_LABELS[unit.leaseStatus] ?? unit.leaseStatus}</span></div>}
                              {unit.leaseMonthlyRent && <div className="flex justify-between"><span className="text-muted-foreground">Rent</span><span className="font-medium">{fmt(unit.leaseMonthlyRent)}/mo</span></div>}
                              {urgency && unit.leaseEndDate && (
                                <div className={cn('mt-2 rounded-md border px-2.5 py-1.5 text-xs flex items-center gap-1.5', URGENCY_STYLES[urgency])}>
                                  <AlertTriangle className="h-3 w-3 shrink-0" />
                                  Lease expires in {days} day{days !== 1 ? 's' : ''}
                                </div>
                              )}
                              <Link href={`/projects/${slug}/tenants/${unit.tenant.id}`} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-1">
                                <ExternalLink className="h-3 w-3" /> Tenant detail
                              </Link>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              <p className="text-xs text-muted-foreground">No active lease</p>
                              <Link href={`/projects/${slug}/units/${unit.id}`} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                                <ExternalLink className="h-3 w-3" /> Unit settings
                              </Link>
                            </div>
                          )}
                        </div>

                        {/* ---- LEDGER SUMMARY ---- */}
                        <div className="rounded-lg border p-3 space-y-2">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                            <DollarSign className="h-3 w-3" /> Ledger
                          </h4>
                          {charged > 0 || paid > 0 ? (
                            <div className="space-y-2">
                              <div className="grid grid-cols-3 gap-1 text-center">
                                <div className="rounded-md bg-muted/40 px-1.5 py-1">
                                  <p className="text-[10px] text-muted-foreground">Charged</p>
                                  <p className="text-xs font-semibold tabular-nums">{fmtFull(charged)}</p>
                                </div>
                                <div className="rounded-md bg-muted/40 px-1.5 py-1">
                                  <p className="text-[10px] text-muted-foreground">Paid</p>
                                  <p className="text-xs font-semibold text-green-700 tabular-nums">{fmtFull(paid)}</p>
                                </div>
                                <div className={cn('rounded-md px-1.5 py-1', balance > 0 ? 'bg-red-50' : 'bg-green-50')}>
                                  <p className="text-[10px] text-muted-foreground">Balance</p>
                                  <p className={cn('text-xs font-semibold tabular-nums', balance > 0 ? 'text-red-700' : 'text-green-700')}>
                                    {balance > 0 ? `+${fmtFull(balance)}` : balance < 0 ? `-${fmtFull(Math.abs(balance))}` : 'Clear'}
                                  </p>
                                </div>
                              </div>
                              <div className="space-y-1">
                                {unit.tenantCharges.slice(0, 3).map(c => (
                                  <div key={c.id} className={cn('flex items-center gap-2 text-xs', c.forgivenAt && 'opacity-40 line-through')}>
                                    <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium shrink-0', CHARGE_TYPE_COLORS[c.type] ?? 'bg-muted')}>
                                      {CHARGE_TYPE_LABELS[c.type] ?? c.type}
                                    </span>
                                    <span className="text-muted-foreground shrink-0">{fmtMonthYear(c.dueDate)}</span>
                                    <span className="font-medium tabular-nums ml-auto">{fmtFull(c.amount)}</span>
                                  </div>
                                ))}
                              </div>
                              {unit.paymentDueDay && (
                                <p className="text-[11px] text-muted-foreground">Due day {unit.paymentDueDay} of each month</p>
                              )}
                              <Link href={`/projects/${slug}/financials`} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                                <ExternalLink className="h-3 w-3" /> Financials
                              </Link>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              <p className="text-xs text-muted-foreground">No ledger records</p>
                              <Link href={`/projects/${slug}/financials`} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                                <ExternalLink className="h-3 w-3" /> Financials
                              </Link>
                            </div>
                          )}
                        </div>

                        {/* ---- MAINTENANCE ---- */}
                        <div className="rounded-lg border p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                              <Wrench className="h-3 w-3" /> Maintenance
                            </h4>
                            <button
                              type="button"
                              onClick={() => setMaintenanceModal({ unitId: unit.id, unitLabel: unit.unitLabel })}
                              className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                            >
                              <Plus className="h-3 w-3" /> New
                            </button>
                          </div>
                          {unit.maintenanceRequests.length > 0 ? (
                            <div className="space-y-1.5">
                              {unit.maintenanceRequests.slice(0, 3).map(req => (
                                <div key={req.id} className="flex items-start justify-between gap-2 text-xs">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium truncate">{req.title}</p>
                                    {req.tenant && <p className="text-muted-foreground truncate">{req.tenant.name}</p>}
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                                    <select
                                      value={req.status}
                                      onChange={e => updateMaintenanceStatus(req.id, e.target.value)}
                                      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium border-0 cursor-pointer appearance-none bg-muted text-muted-foreground"
                                      style={{ backgroundImage: 'none' }}
                                    >
                                      {MAINTENANCE_STATUSES.map(s => <option key={s} value={s}>{MAINTENANCE_STATUS_LABELS[s]}</option>)}
                                    </select>
                                    <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', MAINTENANCE_PRIORITY_COLORS[req.priority] ?? 'bg-muted')}>
                                      {(MAINTENANCE_PRIORITY_LABELS[req.priority] ?? req.priority).charAt(0)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                              {unit.maintenanceRequests.length > 3 && (
                                <p className="text-[11px] text-muted-foreground">+{unit.maintenanceRequests.length - 3} more</p>
                              )}
                              <Link href={`/projects/${slug}/maintenance`} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                                <ExternalLink className="h-3 w-3" /> All requests
                              </Link>
                            </div>
                          ) : <p className="text-xs text-muted-foreground">No open requests</p>}
                        </div>

                        {/* ---- MESSAGES ---- */}
                        <div className="rounded-lg border p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                              <MessageSquare className="h-3 w-3" /> Messages
                              {unit.unreadMessages > 0 && (
                                <span className="rounded-full bg-blue-100 text-blue-700 px-1.5 py-0 text-[10px] font-medium">{unit.unreadMessages}</span>
                              )}
                            </h4>
                            {unit.tenant && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (unit.tenant) setMessageModal({ unitId: unit.id, tenantId: unit.tenant.id, tenantName: unit.tenant.name, unitLabel: unit.unitLabel })
                                }}
                                className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                              >
                                <Send className="h-3 w-3" /> Reply
                              </button>
                            )}
                          </div>
                          {unit.recentMessages.length > 0 ? (
                            <div className="space-y-1.5">
                              {unit.recentMessages.slice(0, 3).map(msg => (
                                <div key={msg.id} className="text-xs">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-medium truncate">{msg.tenant?.name ?? 'Tenant'}</span>
                                    <span className="text-[10px] text-muted-foreground shrink-0">{fmtRelativeTime(msg.createdAt)}</span>
                                  </div>
                                  {msg.subject && <p className="text-muted-foreground font-medium truncate">{msg.subject}</p>}
                                  <p className="text-muted-foreground truncate">{msg.body}</p>
                                </div>
                              ))}
                              {unit.recentMessages.length > 3 && (
                                <Link href={`/projects/${slug}/messages`} className="text-[11px] text-primary hover:underline">
                                  View all messages
                                </Link>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">{unit.tenant ? 'No unread messages' : 'No tenant'}</p>
                          )}
                          {unit.tenant && (
                            <Link
                              href={`/projects/${slug}/messages`}
                              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-1"
                            >
                              <ExternalLink className="h-3 w-3" /> All messages
                            </Link>
                          )}
                        </div>

                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Modals */}
      {maintenanceModal && (
        <MaintenanceModal
          propertyId={projectId}
          unitId={maintenanceModal.unitId}
          unitLabel={maintenanceModal.unitLabel}
          onClose={() => setMaintenanceModal(null)}
          onCreated={() => { setMaintenanceModal(null); router.refresh() }}
        />
      )}
      {messageModal && (
        <MessageModal
          propertyId={projectId}
          unitId={messageModal.unitId}
          tenantId={messageModal.tenantId}
          tenantName={messageModal.tenantName}
          unitLabel={messageModal.unitLabel}
          onClose={() => setMessageModal(null)}
          onSent={() => { setMessageModal(null); router.refresh() }}
        />
      )}
    </div>
  )
}

/* ==================================================================== */
/*  Maintenance Modal                                                    */
/* ==================================================================== */

function MaintenanceModal({ propertyId, unitId, unitLabel, onClose, onCreated }: {
  propertyId: string; unitId: string; unitLabel: string; onClose: () => void; onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('MEDIUM')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !description.trim()) { setError('Title and description are required'); return }
    setSubmitting(true); setError(null)
    try {
      const res = await fetch(`/api/projects/${propertyId}/maintenance`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId, title: title.trim(), description: description.trim(), priority }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to create request'); return }
      onCreated()
    } finally { setSubmitting(false) }
  }

  return (
    <div ref={backdropRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={e => { if (e.target === backdropRef.current) onClose() }}>
      <div className="w-full max-w-lg mx-4 rounded-xl border bg-background shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div><h3 className="text-sm font-semibold">New maintenance request</h3><p className="text-xs text-muted-foreground mt-0.5">Unit: {unitLabel}</p></div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
          <div>
            <label className="block text-xs font-medium mb-1.5">Title <span className="text-destructive">*</span></label>
            <input ref={inputRef} type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" placeholder="e.g. Leaking faucet in kitchen" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">Description <span className="text-destructive">*</span></label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none" rows={3} placeholder="Describe the issue in detail" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">Priority</label>
            <div className="flex gap-2">
              {Object.entries(MAINTENANCE_PRIORITY_LABELS).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setPriority(value)} className={cn('rounded-full px-3 py-1.5 text-xs font-medium transition-all', priority === value ? cn(MAINTENANCE_PRIORITY_COLORS[value], 'ring-2 ring-offset-1 ring-primary/30') : 'border text-muted-foreground hover:bg-muted/50')}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
            <button type="submit" disabled={submitting || !title.trim() || !description.trim()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {submitting ? 'Creating…' : 'Create request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ==================================================================== */
/*  Message Modal                                                        */
/* ==================================================================== */

function MessageModal({ propertyId, unitId, tenantId, tenantName, unitLabel, onClose, onSent }: {
  propertyId: string; unitId: string; tenantId: string; tenantName: string; unitLabel: string
  onClose: () => void; onSent: () => void
}) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) { setError('Message body is required'); return }
    setSubmitting(true); setError(null)
    try {
      const res = await fetch(`/api/projects/${propertyId}/units/${unitId}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, subject: subject.trim() || undefined, body: body.trim(), senderRole: 'manager' }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to send message'); return }
      onSent()
    } finally { setSubmitting(false) }
  }

  return (
    <div ref={backdropRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={e => { if (e.target === backdropRef.current) onClose() }}>
      <div className="w-full max-w-lg mx-4 rounded-xl border bg-background shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div><h3 className="text-sm font-semibold">Message to {tenantName}</h3><p className="text-xs text-muted-foreground mt-0.5">Unit: {unitLabel}</p></div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
          <div>
            <label className="block text-xs font-medium mb-1.5">Subject</label>
            <input ref={inputRef} type="text" value={subject} onChange={e => setSubject(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" placeholder="Optional subject" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">Message <span className="text-destructive">*</span></label>
            <textarea value={body} onChange={e => setBody(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none" rows={4} placeholder="Write your message…" />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
            <button type="submit" disabled={submitting || !body.trim()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {submitting ? 'Sending…' : 'Send message'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
