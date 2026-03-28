'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Wrench, Building2, Search, ChevronDown, ChevronUp, ChevronRight,
  AlertTriangle, MapPin, Plus, X, ExternalLink,
  Calendar, DollarSign, MessageSquare, Send, Mail, ArrowUpDown,
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
  bathrooms: number | null; squareFootage: number | null;
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

/* Flat row for the table */
interface UnitRow {
  unit: Unit
  property: Property
  /** index of this unit within its property's filtered units */
  indexInProperty: number
  /** total filtered units in this property */
  totalInProperty: number
}

type StatusFilter = 'ALL' | 'LEASED' | 'VACANT' | 'NOTICE_GIVEN' | 'PREPARING' | 'LISTED'
  | 'EXPIRING' | 'MAINTENANCE_OPEN' | 'RENT_OVERDUE' | 'UNREAD_MESSAGES'
const STATUS_FILTERS: StatusFilter[] = [
  'ALL', 'LEASED', 'VACANT', 'NOTICE_GIVEN', 'PREPARING', 'LISTED',
  'EXPIRING', 'MAINTENANCE_OPEN', 'RENT_OVERDUE', 'UNREAD_MESSAGES',
]

type SortCol = 'property' | 'status' | 'tenant' | 'leaseEnd' | 'rent' | 'balance' | 'paymentStatus' | 'maintenance'
type SortDir = 'asc' | 'desc'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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

function hasOverdueRent(unit: Unit): boolean {
  const charged = unit.tenantCharges.filter(c => !c.forgivenAt).reduce((sum, c) => sum + c.amount, 0)
  const paid = unit.tenantPayments.reduce((sum, p) => sum + p.amount, 0)
  return charged - paid > 0
}

function getBalance(unit: Unit): number {
  const charged = unit.tenantCharges.filter(c => !c.forgivenAt).reduce((sum, c) => sum + c.amount, 0)
  const paid = unit.tenantPayments.reduce((sum, p) => sum + p.amount, 0)
  return charged - paid
}

/** Returns a sortable numeric score for payment status: 0=vacant/none, 1=current, 2=partial, 3=late<30, 4=30+, 5=60+ */
function paymentStatusScore(unit: Unit): number {
  if (!unit.tenant) return 0
  const charged = unit.tenantCharges.filter(c => !c.forgivenAt).reduce((sum, c) => sum + c.amount, 0)
  const paid = unit.tenantPayments.reduce((sum, p) => sum + p.amount, 0)
  if (charged === 0) return 0
  const balance = charged - paid
  if (balance <= 0) return 1 // current
  // check oldest unpaid charge date for lateness
  const latestCharge = unit.tenantCharges
    .filter(c => !c.forgivenAt)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0]
  if (!latestCharge) return 2
  const daysSinceDue = Math.floor((Date.now() - new Date(latestCharge.dueDate).getTime()) / (1000 * 60 * 60 * 24))
  if (paid > 0 && paid < charged) return 2 // partial
  if (daysSinceDue >= 60) return 5
  if (daysSinceDue >= 30) return 4
  if (daysSinceDue > 0) return 3
  return 1
}

function PaymentStatusBadge({ unit }: { unit: Unit }) {
  if (!unit.tenant) return <span className="text-muted-foreground/30 text-xs">—</span>
  const charged = unit.tenantCharges.filter(c => !c.forgivenAt).reduce((sum, c) => sum + c.amount, 0)
  const paid = unit.tenantPayments.reduce((sum, p) => sum + p.amount, 0)
  if (charged === 0) return <span className="text-muted-foreground/30 text-xs">—</span>

  const score = paymentStatusScore(unit)
  const configs: Record<number, { label: string; cls: string }> = {
    1: { label: 'Current', cls: 'bg-green-100 text-green-800' },
    2: { label: 'Partial', cls: 'border border-amber-300 text-amber-700 bg-transparent' },
    3: { label: 'Late', cls: 'bg-amber-100 text-amber-800' },
    4: { label: '30+', cls: 'bg-red-100 text-red-800' },
    5: { label: '60+', cls: 'bg-red-200 text-red-900 font-semibold' },
  }
  const cfg = configs[score]
  if (!cfg) return null
  return (
    <span className={cn('inline-block rounded-full px-2 py-0.5 text-[11px] font-medium', cfg.cls)}>
      {cfg.label}
    </span>
  )
}

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
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null)
  const [maintenanceModal, setMaintenanceModal] = useState<{ propertyId: string; unitId: string; unitLabel: string } | null>(null)
  const [messageModal, setMessageModal] = useState<{ propertyId: string; unitId: string; tenantId: string; tenantName: string; unitLabel: string } | null>(null)
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null)
  const [sortCol, setSortCol] = useState<SortCol | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const occupancyPct = kpis.totalUnits > 0 ? Math.round((kpis.leasedUnits / kpis.totalUnits) * 100) : 0

  const matchesFilter = useCallback((unit: Unit): boolean => {
    if (statusFilter === 'EXPIRING') return getLeaseUrgency(unit.leaseEndDate) !== null
    if (statusFilter === 'MAINTENANCE_OPEN') return unit.openMaintenance > 0
    if (statusFilter === 'RENT_OVERDUE') return hasOverdueRent(unit)
    if (statusFilter === 'UNREAD_MESSAGES') return unit.unreadMessages > 0
    if (statusFilter !== 'ALL') return unit.status === statusFilter
    return true
  }, [statusFilter])

  const matchesSearch = useCallback((unit: Unit, property: Property): boolean => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return unit.unitLabel.toLowerCase().includes(q) ||
      unit.tenant?.name.toLowerCase().includes(q) ||
      unit.tenant?.email.toLowerCase().includes(q) ||
      property.name.toLowerCase().includes(q) ||
      (property.address ?? '').toLowerCase().includes(q)
  }, [searchQuery])

  // Build flat rows grouped by property (default sort), then apply sorting
  const flatRows: UnitRow[] = (() => {
    // First collect rows per property in natural order
    const grouped: UnitRow[][] = []
    for (const property of properties) {
      const filteredUnits = property.units.filter(u => matchesFilter(u) && matchesSearch(u, property))
      if (filteredUnits.length === 0) continue
      grouped.push(filteredUnits.map((unit, idx) => ({
        unit,
        property,
        indexInProperty: idx,
        totalInProperty: filteredUnits.length,
      })))
    }

    // Flatten
    let rows = grouped.flat()

    // Apply sort
    if (sortCol) {
      rows = [...rows].sort((a, b) => {
        let cmp = 0
        switch (sortCol) {
          case 'property': cmp = a.property.name.localeCompare(b.property.name) || a.unit.unitLabel.localeCompare(b.unit.unitLabel); break
          case 'status': cmp = (a.unit.status ?? '').localeCompare(b.unit.status ?? ''); break
          case 'tenant': cmp = (a.unit.tenant?.name ?? '').localeCompare(b.unit.tenant?.name ?? ''); break
          case 'leaseEnd': {
            const aE = a.unit.leaseEndDate ? new Date(a.unit.leaseEndDate).getTime() : Infinity
            const bE = b.unit.leaseEndDate ? new Date(b.unit.leaseEndDate).getTime() : Infinity
            cmp = aE - bE; break
          }
          case 'rent': cmp = (a.unit.monthlyRent ?? 0) - (b.unit.monthlyRent ?? 0); break
          case 'balance': cmp = getBalance(a.unit) - getBalance(b.unit); break
          case 'paymentStatus': cmp = paymentStatusScore(a.unit) - paymentStatusScore(b.unit); break
          case 'maintenance': cmp = a.unit.openMaintenance - b.unit.openMaintenance; break
        }
        return sortDir === 'asc' ? cmp : -cmp
      })
      // when sorted by non-property col, update indexInProperty so all show full property name
      rows = rows.map(r => ({ ...r, indexInProperty: sortCol === 'property' ? r.indexInProperty : 0 }))
    }

    return rows
  })()

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
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

  async function updateMaintenanceStatus(propertyId: string, requestId: string, newStatus: string) {
    await fetch(`/api/projects/${propertyId}/maintenance/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    router.refresh()
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
        <KpiCard label="Leased" value={kpis.leasedUnits} accent="green"
          onClick={kpis.leasedUnits > 0 ? () => setStatusFilter(statusFilter === 'LEASED' ? 'ALL' : 'LEASED') : undefined}
          active={statusFilter === 'LEASED'}
        />
        <KpiCard label="Vacant" value={kpis.vacantUnits} accent={kpis.vacantUnits > 0 ? 'amber' : undefined}
          onClick={kpis.vacantUnits > 0 ? () => setStatusFilter(statusFilter === 'VACANT' ? 'ALL' : 'VACANT') : undefined}
          active={statusFilter === 'VACANT'}
        />
        <KpiCard label="Revenue/mo" value={fmt(kpis.monthlyRevenue)} />
        <KpiCard
          label="Expiring ≤90d"
          value={kpis.expiringLeases}
          accent={kpis.expiringLeases > 0 ? 'red' : undefined}
          active={statusFilter === 'EXPIRING'}
          onClick={kpis.expiringLeases > 0 ? () => setStatusFilter(statusFilter === 'EXPIRING' ? 'ALL' : 'EXPIRING') : undefined}
        />
        <KpiCard
          label="Rent overdue"
          value={kpis.overduePayments}
          accent={kpis.overduePayments > 0 ? 'red' : undefined}
          active={statusFilter === 'RENT_OVERDUE'}
          onClick={kpis.overduePayments > 0 ? () => setStatusFilter(statusFilter === 'RENT_OVERDUE' ? 'ALL' : 'RENT_OVERDUE') : undefined}
        />
        <KpiCard
          label="Unread msgs"
          value={kpis.unreadMessages}
          accent={kpis.unreadMessages > 0 ? 'amber' : undefined}
          active={statusFilter === 'UNREAD_MESSAGES'}
          onClick={kpis.unreadMessages > 0 ? () => setStatusFilter(statusFilter === 'UNREAD_MESSAGES' ? 'ALL' : 'UNREAD_MESSAGES') : undefined}
        />
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
      {/*  FLAT TABLE                                                    */}
      {/* ============================================================= */}

      {flatRows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">No units match your filters.</p>
          <button type="button" onClick={() => { setStatusFilter('ALL'); setSearchQuery('') }} className="text-xs text-primary hover:underline mt-1">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          {/* Sticky header */}
          <div className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm border-b">
            <div className="grid grid-cols-[minmax(160px,2fr)_80px_100px_90px_75px_90px_80px_36px_60px] gap-0 px-3 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              <ColHeader label="Property / Unit" col="property" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <ColHeader label="Status" col="status" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <ColHeader label="Tenant" col="tenant" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <ColHeader label="Lease ends" col="leaseEnd" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <ColHeader label="Rent" col="rent" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="text-right" />
              <ColHeader label="Balance" col="balance" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="text-right" />
              <ColHeader label="Payment" col="paymentStatus" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="hidden md:block" />
              <ColHeader label="" col="maintenance" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="text-center hidden md:block" icon={<Wrench className="h-3 w-3 mx-auto" />} />
              <span className="text-center">
                <Mail className="h-3 w-3 mx-auto opacity-60" />
              </span>
            </div>
          </div>

          {/* Rows */}
          <div>
            {flatRows.map(({ unit, property, indexInProperty, totalInProperty }, rowIdx) => {
              const isFirstInGroup = indexInProperty === 0
              const isMultiUnit = totalInProperty > 1
              const isExpanded = expandedUnit === unit.id
              const urgency = getLeaseUrgency(unit.leaseEndDate)
              const days = unit.leaseEndDate ? daysUntil(unit.leaseEndDate) : null
              const balance = getBalance(unit)
              const hasLedger = unit.tenantCharges.length > 0 || unit.tenantPayments.length > 0

              // Group separation: add top margin before first row of a new property group
              const prevRow = rowIdx > 0 ? flatRows[rowIdx - 1] : null
              const isNewGroup = !sortCol && prevRow && prevRow.property.id !== property.id

              return (
                <div key={unit.id} className={cn(isNewGroup && 'mt-1')}>
                  {/* Main row */}
                  <div
                    className={cn(
                      'grid grid-cols-[minmax(160px,2fr)_80px_100px_90px_75px_90px_80px_36px_60px] gap-0 px-3 py-0 items-stretch border-b last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer group',
                      isMultiUnit && !sortCol && 'border-l-2 border-l-muted',
                      isExpanded && 'bg-muted/10 border-l-2 border-l-primary/40',
                      urgency === 'critical' && 'bg-red-50/30',
                    )}
                    onClick={() => setExpandedUnit(isExpanded ? null : unit.id)}
                  >
                    {/* Property / Unit cell */}
                    <div className="flex items-center gap-2 py-3 pr-2 min-w-0">
                      <span className="text-muted-foreground/40 shrink-0">
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      </span>
                      {isFirstInGroup || !!sortCol ? (
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate leading-tight">{property.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {[property.address, property.city].filter(Boolean).join(' · ')}
                            {isMultiUnit && !sortCol && <span className="ml-1">· {unit.unitLabel}</span>}
                          </p>
                        </div>
                      ) : (
                        <div className="min-w-0 pl-4">
                          <p className="text-[13px] font-medium truncate">{unit.unitLabel}</p>
                          {property.address && <p className="text-[11px] text-muted-foreground truncate">{property.address}</p>}
                        </div>
                      )}
                    </div>

                    {/* Status */}
                    <div className="flex items-center py-3" onClick={e => e.stopPropagation()}>
                      <span className={cn('inline-block rounded-full px-2 py-0.5 text-[11px] font-medium', UNIT_STATUS_COLORS[unit.status] ?? 'bg-muted text-muted-foreground')}>
                        {UNIT_STATUS_LABELS[unit.status] ?? unit.status}
                      </span>
                    </div>

                    {/* Tenant */}
                    <div className="flex items-center py-3 pr-2 min-w-0">
                      <span className="text-sm text-muted-foreground truncate">
                        {unit.tenant?.name ?? <span className="text-muted-foreground/30">—</span>}
                      </span>
                    </div>

                    {/* Lease end */}
                    <div className="flex items-center py-3">
                      {unit.leaseEndDate ? (
                        <div>
                          <p className={cn('text-xs', urgency && 'font-medium')}>
                            {urgency && <span className={cn('inline-block h-1.5 w-1.5 rounded-full mr-1 translate-y-[-1px]',
                              urgency === 'critical' ? 'bg-red-500' : urgency === 'warning' ? 'bg-amber-500' : 'bg-yellow-500'
                            )} />}
                            {fmtShortDate(unit.leaseEndDate)}
                          </p>
                          {urgency && days !== null && (
                            <p className={cn('text-[10px]', urgency === 'critical' ? 'text-red-600' : 'text-amber-600')}>{days}d</p>
                          )}
                        </div>
                      ) : <span className="text-xs text-muted-foreground/30">—</span>}
                    </div>

                    {/* Rent */}
                    <div className="flex items-center justify-end py-3 pr-2">
                      <span className="text-xs font-medium tabular-nums">
                        {unit.monthlyRent ? fmt(unit.monthlyRent) : <span className="text-muted-foreground/30">—</span>}
                      </span>
                    </div>

                    {/* Balance */}
                    <div className="flex items-center justify-end py-3 pr-2">
                      {hasLedger ? (
                        <span className={cn('text-xs font-medium tabular-nums', balance > 0 ? 'text-red-600' : 'text-green-600')}>
                          {balance > 0 ? `+${fmt(balance)}` : balance < 0 ? `-${fmt(Math.abs(balance))}` : 'Clear'}
                        </span>
                      ) : <span className="text-xs text-muted-foreground/30">—</span>}
                    </div>

                    {/* Payment status */}
                    <div className="hidden md:flex items-center py-3">
                      <PaymentStatusBadge unit={unit} />
                    </div>

                    {/* Maintenance */}
                    <div className="hidden md:flex items-center justify-center py-3">
                      {unit.openMaintenance > 0 ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-semibold">
                          {unit.openMaintenance}
                        </span>
                      ) : null}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-center gap-1 py-3" onClick={e => e.stopPropagation()}>
                      <Link
                        href={`/projects/${property.slug}`}
                        className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Open property"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                      {unit.tenant && (
                        <button
                          type="button"
                          onClick={() => setMessageModal({ propertyId: property.id, unitId: unit.id, tenantId: unit.tenant!.id, tenantName: unit.tenant!.name, unitLabel: unit.unitLabel })}
                          className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title="Send message"
                        >
                          <Mail className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded detail panel */}
                  {isExpanded && (
                    <ExpandedPanel
                      unit={unit}
                      property={property}
                      onCreateMaintenance={() => setMaintenanceModal({ propertyId: property.id, unitId: unit.id, unitLabel: unit.unitLabel })}
                      onSendMessage={() => {
                        if (unit.tenant) setMessageModal({ propertyId: property.id, unitId: unit.id, tenantId: unit.tenant.id, tenantName: unit.tenant.name, unitLabel: unit.unitLabel })
                      }}
                      onMaintenanceStatusChange={(reqId, s) => updateMaintenanceStatus(property.id, reqId, s)}
                    />
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
/*  Column header with sort                                              */
/* ==================================================================== */

function ColHeader({ label, col, sortCol, sortDir, onSort, className, icon }: {
  label: string; col: SortCol; sortCol: SortCol | null; sortDir: SortDir
  onSort: (col: SortCol) => void; className?: string; icon?: React.ReactNode
}) {
  const active = sortCol === col
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className={cn('flex items-center gap-1 text-left hover:text-foreground transition-colors', active && 'text-foreground', className)}
    >
      {icon ?? label}
      {active
        ? (sortDir === 'asc' ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />)
        : <ArrowUpDown className="h-3 w-3 shrink-0 opacity-30" />}
    </button>
  )
}

/* ==================================================================== */
/*  KPI Card                                                             */
/* ==================================================================== */

function KpiCard({ label, value, accent, sub, onClick, active }: {
  label: string; value: string | number; accent?: 'green' | 'amber' | 'red'
  sub?: React.ReactNode; onClick?: () => void; active?: boolean
}) {
  const accentClasses = { green: 'border-green-200 bg-green-50/50', amber: 'border-amber-200 bg-amber-50/50', red: 'border-red-200 bg-red-50/50' }
  const Comp = onClick ? 'button' : 'div'

  return (
    <Comp
      onClick={onClick}
      className={cn(
        'rounded-lg border px-3 py-2.5 text-left transition-colors',
        accent && accentClasses[accent],
        onClick && 'hover:bg-muted/40 cursor-pointer',
        active && 'ring-2 ring-primary/30',
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
/*  Expanded detail panel                                                */
/* ==================================================================== */

function ExpandedPanel({ unit, property, onCreateMaintenance, onSendMessage, onMaintenanceStatusChange }: {
  unit: Unit; property: Property
  onCreateMaintenance: () => void; onSendMessage: () => void
  onMaintenanceStatusChange: (reqId: string, status: string) => void
}) {
  const urgency = getLeaseUrgency(unit.leaseEndDate)
  const days = unit.leaseEndDate ? daysUntil(unit.leaseEndDate) : null
  const charged = unit.tenantCharges.filter(c => !c.forgivenAt).reduce((s, c) => s + c.amount, 0)
  const paid = unit.tenantPayments.reduce((s, p) => s + p.amount, 0)
  const balance = charged - paid

  return (
    <div className="border-b bg-muted/5 border-l-2 border-l-primary/30 px-4 py-4">
      <div className="grid gap-4 sm:grid-cols-3">

        {/* ---- LEASE INFO ---- */}
        <div className="rounded-lg border bg-background p-3 space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Calendar className="h-3 w-3" /> Lease
          </h4>
          {unit.tenant ? (
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Tenant</span><span className="font-medium">{unit.tenant.name}</span></div>
              {unit.tenant.email && <div className="flex justify-between"><span className="text-muted-foreground">Email</span><a href={`mailto:${unit.tenant.email}`} className="text-primary hover:underline text-xs truncate max-w-[140px]">{unit.tenant.email}</a></div>}
              {unit.tenant.phone && <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><a href={`tel:${unit.tenant.phone}`} className="text-primary hover:underline text-xs">{unit.tenant.phone}</a></div>}
              {unit.leaseStartDate && unit.leaseEndDate && <div className="flex justify-between"><span className="text-muted-foreground">Period</span><span className="text-xs">{fmtDate(unit.leaseStartDate)} — {fmtDate(unit.leaseEndDate)}</span></div>}
              {unit.leaseStatus && <div className="flex justify-between items-center"><span className="text-muted-foreground">Status</span><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', LEASE_STATUS_COLORS[unit.leaseStatus] ?? 'bg-muted')}>{LEASE_STATUS_LABELS[unit.leaseStatus] ?? unit.leaseStatus}</span></div>}
              {unit.leaseMonthlyRent && <div className="flex justify-between"><span className="text-muted-foreground">Rent</span><span className="font-medium">{fmt(unit.leaseMonthlyRent)}/mo</span></div>}
              {urgency && unit.leaseEndDate && (
                <div className={cn('mt-1 rounded-md border px-2.5 py-1.5 text-xs flex items-center gap-1.5', URGENCY_STYLES[urgency])}>
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  Expires in {days} day{days !== 1 ? 's' : ''}
                </div>
              )}
              <Link href={`/projects/${property.slug}/tenants/${unit.tenant.id}`} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-1">
                <ExternalLink className="h-3 w-3" /> Tenant detail
              </Link>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">No active lease</p>
              <Link href={`/projects/${property.slug}/units/${unit.id}`} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                <ExternalLink className="h-3 w-3" /> Unit settings
              </Link>
            </div>
          )}
        </div>

        {/* ---- LEDGER SUMMARY ---- */}
        <div className="rounded-lg border bg-background p-3 space-y-2">
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
              <Link href={`/projects/${property.slug}/units/${unit.id}`} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                <ExternalLink className="h-3 w-3" /> Apply levy / full ledger
              </Link>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">No ledger records</p>
              <Link href={`/projects/${property.slug}/units/${unit.id}`} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                <ExternalLink className="h-3 w-3" /> Apply levy / full ledger
              </Link>
            </div>
          )}
        </div>

        {/* ---- MAINTENANCE + MESSAGES ---- */}
        <div className="space-y-3">
          <div className="rounded-lg border bg-background p-3 space-y-2">
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
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{req.title}</p>
                      {req.tenant && <p className="text-muted-foreground truncate">{req.tenant.name}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                      <select
                        value={req.status}
                        onChange={e => onMaintenanceStatusChange(req.id, e.target.value)}
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
                <Link href={`/projects/${property.slug}/maintenance`} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" /> All requests
                </Link>
              </div>
            ) : <p className="text-xs text-muted-foreground">No open requests</p>}
          </div>

          <div className="rounded-lg border bg-background p-3 space-y-2">
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
                  <Send className="h-3 w-3" /> New
                </button>
              )}
            </div>
            {unit.recentMessages.length > 0 ? (() => {
              const threadMap = new Map<string, RecentMessage[]>()
              for (const msg of unit.recentMessages) {
                const key = (msg.subject ?? '').trim() || '(no subject)'
                if (!threadMap.has(key)) threadMap.set(key, [])
                threadMap.get(key)!.push(msg)
              }
              const threads = Array.from(threadMap.entries())
                .map(([subject, msgs]) => ({ subject, count: msgs.length, lastAt: msgs[msgs.length - 1].createdAt, unread: msgs.filter(m => !m.isRead && m.senderRole !== 'owner').length }))
                .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
                .slice(0, 3)
              return (
                <div className="space-y-1">
                  {threads.map(t => (
                    <Link key={t.subject} href={`/projects/${property.slug}/messages/${unit.tenant!.id}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40 transition-colors group">
                      <span className={cn('text-xs truncate flex-1', t.unread > 0 ? 'font-semibold' : 'text-muted-foreground')}>{t.subject}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {t.unread > 0 && <span className="rounded-full bg-blue-100 text-blue-700 px-1 text-[10px] font-semibold">{t.unread}</span>}
                        <span className="text-[10px] text-muted-foreground">{fmtRelativeTime(t.lastAt)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )
            })() : (
              <p className="text-xs text-muted-foreground">{unit.tenant ? 'No messages yet' : 'No tenant'}</p>
            )}
            {unit.tenant && (
              <Link href={`/projects/${property.slug}/messages/${unit.tenant.id}`} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-1">
                <ExternalLink className="h-3 w-3" /> All threads
              </Link>
            )}
          </div>
        </div>

      </div>
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
