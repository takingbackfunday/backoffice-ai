'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Wrench, Building2, Search, ChevronDown, ChevronRight,
  AlertTriangle, MapPin, Plus, X, ExternalLink,
  User, Calendar, DollarSign, Home, ArrowUpRight,
  MessageSquare, Send, CheckCircle2, Clock, CircleAlert,
  CircleDollarSign, Mail,
} from 'lucide-react'
import {
  UNIT_STATUS_COLORS, UNIT_STATUS_LABELS,
  MAINTENANCE_PRIORITY_LABELS, MAINTENANCE_PRIORITY_COLORS,
  MAINTENANCE_STATUS_LABELS, LEASE_STATUS_LABELS, LEASE_STATUS_COLORS,
} from '@/types'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MaintenanceRequest {
  id: string; title: string; description: string; priority: string;
  status: string; createdAt: string;
  tenant: { id: string; name: string } | null
}

interface RentPayment {
  id: string; amount: number; dueDate: string;
  paidDate: string | null; status: string;
  lateFeeApplied: number | null; notes: string | null
}

interface RecentMessage {
  id: string; subject: string | null; body: string;
  createdAt: string; isRead: boolean; senderRole: string;
  tenant: { id: string; name: string } | null
}

interface Unit {
  id: string; unitLabel: string; status: string;
  monthlyRent: number | null; bedrooms: number | null;
  bathrooms: number | null; squareFootage: number | null;
  tenant: { id: string; name: string; email: string; phone: string | null } | null
  leaseId: string | null;
  leaseEndDate: string | null; leaseStartDate: string | null;
  leaseStatus: string | null; leaseMonthlyRent: number | null;
  paymentDueDay: number | null;
  openMaintenance: number; unreadMessages: number;
  maintenanceRequests: MaintenanceRequest[]
  rentPayments: RentPayment[]
  recentMessages: RecentMessage[]
}

interface Property {
  id: string; name: string; slug: string;
  address: string | null; city: string | null; state: string | null;
  propertyType: string | null; units: Unit[]
}

interface Kpis {
  totalUnits: number; leasedUnits: number; vacantUnits: number;
  openMaintenance: number; monthlyRevenue: number; expiringLeases: number;
  unreadMessages: number; overduePayments: number
}

type StatusFilter = 'ALL' | 'LEASED' | 'VACANT' | 'NOTICE_GIVEN' | 'PREPARING' | 'LISTED'
  | 'EXPIRING' | 'MAINTENANCE_OPEN' | 'RENT_OVERDUE' | 'UNREAD_MESSAGES'
const STATUS_FILTERS: StatusFilter[] = [
  'ALL', 'LEASED', 'VACANT', 'NOTICE_GIVEN', 'PREPARING', 'LISTED',
  'EXPIRING', 'MAINTENANCE_OPEN', 'RENT_OVERDUE', 'UNREAD_MESSAGES',
]

const UNIT_STATUSES = ['VACANT', 'LEASED', 'NOTICE_GIVEN', 'PREPARING', 'MAINTENANCE', 'LISTED'] as const

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  PAID: 'bg-green-100 text-green-800',
  PENDING: 'bg-amber-100 text-amber-800',
  PROCESSING: 'bg-blue-100 text-blue-800',
  LATE: 'bg-red-100 text-red-800',
  PARTIAL: 'bg-orange-100 text-orange-800',
  FAILED: 'bg-red-100 text-red-800',
  WAIVED: 'bg-gray-100 text-gray-600',
}

const PAYMENT_STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  PAID: CheckCircle2,
  PENDING: Clock,
  LATE: CircleAlert,
  PARTIAL: CircleDollarSign,
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const fmtFull = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const fmtShortDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

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

/* ------------------------------------------------------------------ */
/*  Lease urgency helpers                                              */
/* ------------------------------------------------------------------ */

function getLeaseUrgency(endDate: string | null): 'critical' | 'warning' | 'soon' | null {
  if (!endDate) return null
  const days = daysUntil(endDate)
  if (days < 0) return null
  if (days <= 30) return 'critical'
  if (days <= 60) return 'warning'
  if (days <= 90) return 'soon'
  return null
}

function daysUntil(endDate: string): number {
  return Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

const URGENCY_STYLES = {
  critical: 'bg-red-50 border-red-200 text-red-700',
  warning: 'bg-amber-50 border-amber-200 text-amber-700',
  soon: 'bg-yellow-50 border-yellow-200 text-yellow-700',
}

const URGENCY_DOT = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  soon: 'bg-yellow-500',
}

/* ------------------------------------------------------------------ */
/*  Rent payment helpers                                               */
/* ------------------------------------------------------------------ */

function hasOverdueRent(unit: Unit): boolean {
  const now = new Date()
  return unit.rentPayments.some(p =>
    p.status === 'LATE' || (p.status === 'PENDING' && new Date(p.dueDate) < now)
  )
}

/* ------------------------------------------------------------------ */
/*  Filter helpers                                                     */
/* ------------------------------------------------------------------ */

function filterLabel(f: StatusFilter): string {
  switch (f) {
    case 'ALL': return 'All'
    case 'EXPIRING': return 'Expiring leases'
    case 'MAINTENANCE_OPEN': return 'Open maintenance'
    case 'RENT_OVERDUE': return 'Rent overdue'
    case 'UNREAD_MESSAGES': return 'Unread messages'
    default: return UNIT_STATUS_LABELS[f] ?? f
  }
}

function filterCount(f: StatusFilter, properties: Property[]): number {
  const allUnits = properties.flatMap(p => p.units)
  switch (f) {
    case 'ALL': return allUnits.length
    case 'EXPIRING': return allUnits.filter(u => getLeaseUrgency(u.leaseEndDate) !== null).length
    case 'MAINTENANCE_OPEN': return allUnits.filter(u => u.openMaintenance > 0).length
    case 'RENT_OVERDUE': return allUnits.filter(u => hasOverdueRent(u)).length
    case 'UNREAD_MESSAGES': return allUnits.filter(u => u.unreadMessages > 0).length
    default: return allUnits.filter(u => u.status === f).length
  }
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function PortfolioClient({ properties, kpis }: { properties: Property[]; kpis: Kpis }) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(
    () => new Set(properties.map(p => p.id))
  )
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set())
  const [maintenanceModal, setMaintenanceModal] = useState<{ propertyId: string; unitId: string; unitLabel: string } | null>(null)
  const [messageModal, setMessageModal] = useState<{ propertyId: string; unitId: string; tenantId: string; tenantName: string; unitLabel: string } | null>(null)
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null)

  const occupancyPct = kpis.totalUnits > 0 ? Math.round((kpis.leasedUnits / kpis.totalUnits) * 100) : 0

  const applyFilters = useCallback((units: Unit[]) => {
    let result = units
    if (statusFilter === 'EXPIRING') result = result.filter(u => getLeaseUrgency(u.leaseEndDate) !== null)
    else if (statusFilter === 'MAINTENANCE_OPEN') result = result.filter(u => u.openMaintenance > 0)
    else if (statusFilter === 'RENT_OVERDUE') result = result.filter(u => hasOverdueRent(u))
    else if (statusFilter === 'UNREAD_MESSAGES') result = result.filter(u => u.unreadMessages > 0)
    else if (statusFilter !== 'ALL') result = result.filter(u => u.status === statusFilter)

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(u =>
        u.unitLabel.toLowerCase().includes(q) ||
        u.tenant?.name.toLowerCase().includes(q) ||
        u.tenant?.email.toLowerCase().includes(q)
      )
    }
    return result
  }, [statusFilter, searchQuery])

  const filteredProperties = properties
    .map(p => ({ ...p, units: applyFilters(p.units) }))
    .filter(p => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return p.units.length > 0 || p.name.toLowerCase().includes(q) || p.address?.toLowerCase().includes(q)
      }
      return p.units.length > 0
    })

  function toggleProperty(id: string) {
    setExpandedProperties(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleUnit(id: string) {
    setExpandedUnits(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function updateUnitStatus(propertyId: string, unitId: string, newStatus: string) {
    setStatusUpdating(unitId)
    try {
      const res = await fetch(`/api/projects/${propertyId}/units/${unitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) router.refresh()
    } finally {
      setStatusUpdating(null)
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Empty state                                                      */
  /* ---------------------------------------------------------------- */

  if (properties.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Building2 className="h-8 w-8 text-muted-foreground/50" />
        </div>
        <p className="text-sm font-medium mb-1">No active properties</p>
        <p className="text-xs text-muted-foreground mb-4 max-w-xs">
          Create a property project to start tracking units, tenants, leases, and maintenance.
        </p>
        <Link
          href="/projects/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add property
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* ============================================================= */}
      {/*  KPI BAR                                                       */}
      {/* ============================================================= */}

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <KpiCard label="Units" value={kpis.totalUnits} />
        <KpiCard label="Occupancy" value={`${occupancyPct}%`} sub={<OccupancyRing pct={occupancyPct} />} />
        <KpiCard label="Leased" value={kpis.leasedUnits} accent="green" />
        <KpiCard label="Vacant" value={kpis.vacantUnits} accent={kpis.vacantUnits > 0 ? 'amber' : undefined} />
        <KpiCard label="Revenue/mo" value={fmt(kpis.monthlyRevenue)} />
        <KpiCard
          label="Expiring ≤90d"
          value={kpis.expiringLeases}
          accent={kpis.expiringLeases > 0 ? 'red' : undefined}
          onClick={kpis.expiringLeases > 0 ? () => setStatusFilter('EXPIRING') : undefined}
        />
        <KpiCard
          label="Rent overdue"
          value={kpis.overduePayments}
          accent={kpis.overduePayments > 0 ? 'red' : undefined}
          onClick={kpis.overduePayments > 0 ? () => setStatusFilter('RENT_OVERDUE') : undefined}
        />
        <KpiCard
          label="Unread msgs"
          value={kpis.unreadMessages}
          accent={kpis.unreadMessages > 0 ? 'amber' : undefined}
          onClick={kpis.unreadMessages > 0 ? () => setStatusFilter('UNREAD_MESSAGES') : undefined}
        />
      </div>

      {/* Alerts row */}
      <div className="flex flex-col sm:flex-row gap-2">
        {kpis.openMaintenance > 0 && (
          <button
            type="button"
            onClick={() => setStatusFilter('MAINTENANCE_OPEN')}
            className="flex-1 flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-sm text-orange-800 hover:bg-orange-100 transition-colors text-left"
          >
            <Wrench className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">{kpis.openMaintenance} open maintenance</span>
            <ArrowUpRight className="h-3 w-3 opacity-50" />
          </button>
        )}
        {kpis.overduePayments > 0 && (
          <button
            type="button"
            onClick={() => setStatusFilter('RENT_OVERDUE')}
            className="flex-1 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 hover:bg-red-100 transition-colors text-left"
          >
            <CircleAlert className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">{kpis.overduePayments} overdue rent payment{kpis.overduePayments !== 1 ? 's' : ''}</span>
            <ArrowUpRight className="h-3 w-3 opacity-50" />
          </button>
        )}
        {kpis.unreadMessages > 0 && (
          <button
            type="button"
            onClick={() => setStatusFilter('UNREAD_MESSAGES')}
            className="flex-1 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800 hover:bg-blue-100 transition-colors text-left"
          >
            <MessageSquare className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">{kpis.unreadMessages} unread message{kpis.unreadMessages !== 1 ? 's' : ''}</span>
            <ArrowUpRight className="h-3 w-3 opacity-50" />
          </button>
        )}
      </div>

      {/* ============================================================= */}
      {/*  SEARCH + FILTER BAR                                           */}
      {/* ============================================================= */}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search properties, units, tenants…"
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
            const count = filterCount(f, properties)
            const isActive = statusFilter === f
            if (f !== 'ALL' && count === 0) return null
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
                {filterLabel(f)}
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

      {/* ============================================================= */}
      {/*  PROPERTY CARDS                                                */}
      {/* ============================================================= */}

      {filteredProperties.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">No units match your filters.</p>
          <button type="button" onClick={() => { setStatusFilter('ALL'); setSearchQuery('') }} className="text-xs text-primary hover:underline mt-1">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredProperties.map(property => {
            const leased = property.units.filter(u => u.status === 'LEASED').length
            const total = property.units.length
            const isExpanded = expandedProperties.has(property.id)
            const propertyRevenue = property.units
              .filter(u => u.monthlyRent && u.status === 'LEASED')
              .reduce((s, u) => s + (u.monthlyRent ?? 0), 0)

            return (
              <div key={property.id} className="rounded-xl border bg-background overflow-hidden">
                {/* Property header */}
                <button
                  type="button"
                  onClick={() => toggleProperty(property.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                >
                  <span className="text-muted-foreground">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">{property.name}</span>
                      {property.propertyType && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground font-medium shrink-0">
                          {property.propertyType}
                        </span>
                      )}
                    </div>
                    {property.address && (
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {[property.address, property.city, property.state].filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="hidden sm:flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Units</p>
                      <p className="text-sm font-medium">{leased}/{total}</p>
                    </div>
                    {propertyRevenue > 0 && (
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Revenue</p>
                        <p className="text-sm font-medium">{fmt(propertyRevenue)}</p>
                      </div>
                    )}
                  </div>
                  <Link
                    href={`/projects/${property.slug}`}
                    onClick={e => e.stopPropagation()}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="Open property"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </button>

                {/* Units */}
                {isExpanded && (
                  <div className="border-t">
                    <div className="hidden sm:grid grid-cols-[minmax(90px,1fr)_90px_minmax(100px,1.2fr)_90px_80px_44px_44px] gap-2 px-4 py-2 bg-muted/30 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                      <span>Unit</span>
                      <span>Status</span>
                      <span>Tenant</span>
                      <span>Lease ends</span>
                      <span className="text-right">Rent</span>
                      <span className="text-center" title="Maintenance"><Wrench className="h-3 w-3 mx-auto" /></span>
                      <span className="text-center" title="Messages"><Mail className="h-3 w-3 mx-auto" /></span>
                    </div>

                    <div className="divide-y">
                      {property.units.map(unit => (
                        <UnitRow
                          key={unit.id}
                          unit={unit}
                          property={property}
                          isExpanded={expandedUnits.has(unit.id)}
                          onToggle={() => toggleUnit(unit.id)}
                          onStatusChange={(s) => updateUnitStatus(property.id, unit.id, s)}
                          onCreateMaintenance={() => setMaintenanceModal({ propertyId: property.id, unitId: unit.id, unitLabel: unit.unitLabel })}
                          onSendMessage={() => {
                            if (unit.tenant) {
                              setMessageModal({ propertyId: property.id, unitId: unit.id, tenantId: unit.tenant.id, tenantName: unit.tenant.name, unitLabel: unit.unitLabel })
                            }
                          }}
                          isUpdating={statusUpdating === unit.id}
                        />
                      ))}
                    </div>

                    {/* Property footer */}
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/20 border-t text-xs">
                      <Link href={`/projects/${property.slug}/units`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                        <Home className="h-3 w-3" /> Units
                      </Link>
                      <span className="text-muted-foreground/30">·</span>
                      <Link href={`/projects/${property.slug}/leases`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                        <Calendar className="h-3 w-3" /> Leases
                      </Link>
                      <span className="text-muted-foreground/30">·</span>
                      <Link href={`/projects/${property.slug}/maintenance`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                        <Wrench className="h-3 w-3" /> Maintenance
                      </Link>
                      <span className="text-muted-foreground/30">·</span>
                      <Link href={`/projects/${property.slug}/messages`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                        <MessageSquare className="h-3 w-3" /> Messages
                      </Link>
                      <span className="text-muted-foreground/30">·</span>
                      <Link href={`/projects/${property.slug}/financials`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                        <DollarSign className="h-3 w-3" /> Financials
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {maintenanceModal && (
        <MaintenanceModal
          propertyId={maintenanceModal.propertyId}
          unitId={maintenanceModal.unitId}
          unitLabel={maintenanceModal.unitLabel}
          onClose={() => setMaintenanceModal(null)}
          onCreated={() => { setMaintenanceModal(null); router.refresh() }}
        />
      )}
      {messageModal && (
        <MessageModal
          propertyId={messageModal.propertyId}
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
/*  KPI Card                                                             */
/* ==================================================================== */

function KpiCard({ label, value, accent, sub, onClick }: {
  label: string; value: string | number; accent?: 'green' | 'amber' | 'red'
  sub?: React.ReactNode; onClick?: () => void
}) {
  const accentClasses = { green: 'border-green-200 bg-green-50/50', amber: 'border-amber-200 bg-amber-50/50', red: 'border-red-200 bg-red-50/50' }
  const Comp = onClick ? 'button' : 'div'

  return (
    <Comp
      onClick={onClick}
      className={cn(
        'rounded-lg border px-3 py-2.5 text-left transition-colors',
        accent && accentClasses[accent],
        onClick && 'hover:bg-muted/40 cursor-pointer'
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
          <p className="text-lg font-semibold tabular-nums leading-tight">{value}</p>
        </div>
        {sub}
      </div>
    </Comp>
  )
}

/* ==================================================================== */
/*  Occupancy Ring                                                       */
/* ==================================================================== */

function OccupancyRing({ pct }: { pct: number }) {
  const radius = 12; const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference
  return (
    <svg width="30" height="30" className="shrink-0">
      <circle cx="15" cy="15" r={radius} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-muted/60" />
      <circle cx="15" cy="15" r={radius} fill="none" stroke="currentColor" strokeWidth="2.5"
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        className={cn(pct >= 80 ? 'text-green-500' : pct >= 50 ? 'text-amber-500' : 'text-red-500')}
        transform="rotate(-90 15 15)"
      />
    </svg>
  )
}

/* ==================================================================== */
/*  Unit Row                                                             */
/* ==================================================================== */

function UnitRow({ unit, property, isExpanded, onToggle, onStatusChange, onCreateMaintenance, onSendMessage, isUpdating }: {
  unit: Unit; property: Property; isExpanded: boolean
  onToggle: () => void; onStatusChange: (status: string) => void
  onCreateMaintenance: () => void; onSendMessage: () => void; isUpdating: boolean
}) {
  const urgency = getLeaseUrgency(unit.leaseEndDate)
  const days = unit.leaseEndDate ? daysUntil(unit.leaseEndDate) : null
  const overdue = hasOverdueRent(unit)

  return (
    <div className={cn(isExpanded && 'bg-muted/10')}>
      {/* Main row */}
      <div
        className={cn(
          'grid grid-cols-1 sm:grid-cols-[minmax(90px,1fr)_90px_minmax(100px,1.2fr)_90px_80px_44px_44px] gap-2 px-4 py-2.5 items-center hover:bg-muted/20 transition-colors cursor-pointer',
          urgency === 'critical' && 'bg-red-50/40',
          overdue && !urgency && 'bg-red-50/20',
        )}
        onClick={onToggle}
      >
        {/* Unit label */}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground/50">
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </span>
          <span className="text-sm font-medium">{unit.unitLabel}</span>
          {unit.bedrooms !== null && <span className="text-[11px] text-muted-foreground">{unit.bedrooms}bd</span>}
        </div>

        {/* Status dropdown */}
        <div onClick={e => e.stopPropagation()}>
          <select
            value={unit.status}
            onChange={e => onStatusChange(e.target.value)}
            disabled={isUpdating}
            className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium border-0 cursor-pointer appearance-none text-center w-full',
              UNIT_STATUS_COLORS[unit.status] ?? 'bg-muted text-muted-foreground',
              isUpdating && 'opacity-50'
            )}
            style={{ backgroundImage: 'none' }}
          >
            {UNIT_STATUSES.map(s => <option key={s} value={s}>{UNIT_STATUS_LABELS[s]}</option>)}
          </select>
        </div>

        {/* Tenant */}
        <span className="text-sm text-muted-foreground truncate hidden sm:block">
          {unit.tenant ? (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3 shrink-0 opacity-50" />
              {unit.tenant.name}
            </span>
          ) : <span className="text-muted-foreground/40">—</span>}
        </span>

        {/* Lease end */}
        <div className="hidden sm:block">
          {unit.leaseEndDate ? (
            <span className={cn('inline-flex items-center gap-1 text-xs', urgency ? 'font-medium' : 'text-muted-foreground')}>
              {urgency && <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', URGENCY_DOT[urgency])} />}
              {fmtShortDate(unit.leaseEndDate)}
              {urgency && days !== null && <span className="text-[10px] opacity-70">({days}d)</span>}
            </span>
          ) : <span className="text-xs text-muted-foreground/40">—</span>}
        </div>

        {/* Rent */}
        <span className="text-xs font-medium text-right tabular-nums hidden sm:block">
          {unit.monthlyRent ? fmt(unit.monthlyRent) : <span className="text-muted-foreground/40">—</span>}
        </span>

        {/* Maintenance badge */}
        <div className="text-center hidden sm:block">
          {unit.openMaintenance > 0 ? (
            <span className="inline-flex items-center gap-0.5 text-xs text-orange-600 font-medium">
              <Wrench className="h-3 w-3" />{unit.openMaintenance}
            </span>
          ) : <span className="text-xs text-muted-foreground/30">—</span>}
        </div>

        {/* Message badge */}
        <div className="text-center hidden sm:block">
          {unit.unreadMessages > 0 ? (
            <span className="inline-flex items-center gap-0.5 text-xs text-blue-600 font-medium">
              <MessageSquare className="h-3 w-3" />{unit.unreadMessages}
            </span>
          ) : <span className="text-xs text-muted-foreground/30">—</span>}
        </div>
      </div>

      {/* Expanded detail */}
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
                </div>
              ) : <p className="text-xs text-muted-foreground">No active lease</p>}
            </div>

            {/* ---- RENT PAYMENTS ---- */}
            <div className="rounded-lg border p-3 space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <DollarSign className="h-3 w-3" /> Rent payments
              </h4>
              {unit.rentPayments.length > 0 ? (
                <div className="space-y-1">
                  {unit.rentPayments.map(payment => {
                    const Icon = PAYMENT_STATUS_ICONS[payment.status] ?? Clock
                    const isOverdue = payment.status === 'LATE' || (payment.status === 'PENDING' && new Date(payment.dueDate) < new Date())
                    return (
                      <div key={payment.id} className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs',
                        isOverdue ? 'bg-red-50 border border-red-200' : 'hover:bg-muted/30'
                      )}>
                        <Icon className={cn('h-3.5 w-3.5 shrink-0',
                          payment.status === 'PAID' ? 'text-green-600' :
                          isOverdue ? 'text-red-600' :
                          'text-muted-foreground'
                        )} />
                        <span className="text-muted-foreground w-16 shrink-0">{fmtMonthYear(payment.dueDate)}</span>
                        <span className="font-medium tabular-nums flex-1">{fmtFull(payment.amount)}</span>
                        <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', PAYMENT_STATUS_COLORS[payment.status] ?? 'bg-muted')}>
                          {payment.status}
                        </span>
                      </div>
                    )
                  })}
                  {unit.paymentDueDay && (
                    <p className="text-[11px] text-muted-foreground mt-1.5">Due day {unit.paymentDueDay} of each month</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No payment records</p>
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
                  onClick={onCreateMaintenance}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Plus className="h-3 w-3" /> New
                </button>
              </div>
              {unit.maintenanceRequests.length > 0 ? (
                <div className="space-y-1.5">
                  {unit.maintenanceRequests.slice(0, 3).map(req => (
                    <div key={req.id} className="flex items-start justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{req.title}</p>
                        <p className="text-muted-foreground">{MAINTENANCE_STATUS_LABELS[req.status] ?? req.status}{req.tenant && ` · ${req.tenant.name}`}</p>
                      </div>
                      <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium shrink-0', MAINTENANCE_PRIORITY_COLORS[req.priority] ?? 'bg-muted')}>
                        {(MAINTENANCE_PRIORITY_LABELS[req.priority] ?? req.priority).charAt(0)}
                      </span>
                    </div>
                  ))}
                  {unit.maintenanceRequests.length > 3 && (
                    <Link href={`/projects/${property.slug}/maintenance`} className="text-[11px] text-primary hover:underline">
                      +{unit.maintenanceRequests.length - 3} more
                    </Link>
                  )}
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
                    onClick={onSendMessage}
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
                    <Link href={`/projects/${property.slug}/messages`} className="text-[11px] text-primary hover:underline">
                      View all messages
                    </Link>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{unit.tenant ? 'No unread messages' : 'No tenant'}</p>
              )}
              {unit.tenant && (
                <Link
                  href={`/projects/${property.slug}/units/${unit.id}`}
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-1"
                >
                  <ExternalLink className="h-3 w-3" /> Full thread
                </Link>
              )}
            </div>
          </div>
        </div>
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
  const [sending, setSending] = useState(false)
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
    if (!subject.trim() || !body.trim()) { setError('Subject and message are required'); return }
    setSending(true); setError(null)
    try {
      const res = await fetch(`/api/projects/${propertyId}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, unitId, subject: subject.trim(), body: body.trim() }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to send message'); return }
      onSent()
    } finally { setSending(false) }
  }

  return (
    <div ref={backdropRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={e => { if (e.target === backdropRef.current) onClose() }}>
      <div className="w-full max-w-lg mx-4 rounded-xl border bg-background shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h3 className="text-sm font-semibold">Message to {tenantName}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Unit: {unitLabel}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}
          <div>
            <label className="block text-xs font-medium mb-1.5">Subject <span className="text-destructive">*</span></label>
            <input ref={inputRef} type="text" value={subject} onChange={e => setSubject(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" placeholder="e.g. Rent reminder for April" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5">Message <span className="text-destructive">*</span></label>
            <textarea value={body} onChange={e => setBody(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none" rows={5} placeholder="Write your message…" />
          </div>
          <p className="text-[11px] text-muted-foreground">An email notification will be sent to {tenantName}.</p>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
            <button type="submit" disabled={sending || !subject.trim() || !body.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
              <Send className="h-3.5 w-3.5" />
              {sending ? 'Sending…' : 'Send message'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
