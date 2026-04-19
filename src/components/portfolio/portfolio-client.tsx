'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Wrench, Plus, X, ExternalLink,
  Calendar, DollarSign, MessageSquare, Send,
  AlertTriangle, ChevronRight, ChevronDown,
} from 'lucide-react'
import { OnboardingBanner } from '@/components/onboarding/onboarding-banner'
import { ActionBanner } from '@/components/ui/action-banner'
import {
  UNIT_STATUS_LABELS,
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

interface InvoiceSummary {
  id: string; invoiceNumber: string; status: string; period: string | null;
  dueDate: string; lineItemTotal: number; paymentTotal: number;
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
  invoices: InvoiceSummary[]
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
  unreadMessages: number; overduePayments: number; activeApplicants: number;
  recentPaymentsCount?: number
}

type PropertyFilter = 'ALL' | 'EXPIRING' | 'MAINTENANCE_OPEN' | 'RENT_OVERDUE' | 'UNREAD_MESSAGES' | 'VACANT'

const MAINTENANCE_STATUSES = ['OPEN', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const fmtFull = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

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

function hasOverdueRent(unit: Unit): boolean {
  const activeInvoices = unit.invoices.filter(inv => inv.status !== 'VOID')
  const charged = activeInvoices.reduce((sum, inv) => sum + inv.lineItemTotal, 0)
  const paid = activeInvoices.reduce((sum, inv) => sum + inv.paymentTotal, 0)
  return charged - paid > 0
}

function getBalance(unit: Unit): number {
  const activeInvoices = unit.invoices.filter(inv => inv.status !== 'VOID')
  const charged = activeInvoices.reduce((sum, inv) => sum + inv.lineItemTotal, 0)
  const paid = activeInvoices.reduce((sum, inv) => sum + inv.paymentTotal, 0)
  return charged - paid
}

function paymentStatusScore(unit: Unit): number {
  if (!unit.tenant) return 0
  const activeInvoices = unit.invoices.filter(inv => inv.status !== 'VOID')
  const charged = activeInvoices.reduce((sum, inv) => sum + inv.lineItemTotal, 0)
  const paid = activeInvoices.reduce((sum, inv) => sum + inv.paymentTotal, 0)
  if (charged === 0) return 0
  const balance = charged - paid
  if (balance <= 0) return 1
  if (paid > 0 && paid < charged) return 2
  const oldestUnpaid = activeInvoices
    .filter(inv => inv.lineItemTotal - inv.paymentTotal > 0)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0]
  if (!oldestUnpaid) return 2
  const daysSinceDue = Math.floor((Date.now() - new Date(oldestUnpaid.dueDate).getTime()) / (1000 * 60 * 60 * 24))
  if (daysSinceDue >= 60) return 5
  if (daysSinceDue >= 30) return 4
  if (daysSinceDue > 0) return 3
  return 1
}

function PaymentStatusBadge({ unit }: { unit: Unit }) {
  if (!unit.tenant) return <span className="text-muted-foreground/30 text-xs">—</span>
  const activeInvoices = unit.invoices.filter(inv => inv.status !== 'VOID')
  const charged = activeInvoices.reduce((sum, inv) => sum + inv.lineItemTotal, 0)
  if (charged === 0) return <span className="text-muted-foreground/30 text-xs">—</span>
  const score = paymentStatusScore(unit)
  const configs: Record<number, { label: string; bg: string; text: string }> = {
    1: { label: 'Current',  bg: '#d1fae5', text: '#065f46' },
    2: { label: 'Partial',  bg: '#fef3c7', text: '#92400e' },
    3: { label: 'Late',     bg: '#fef3c7', text: '#92400e' },
    4: { label: '30+',      bg: '#fee2e2', text: '#991b1b' },
    5: { label: '60+',      bg: '#fecaca', text: '#7f1d1d' },
  }
  const cfg = configs[score]
  if (!cfg) return null
  return (
    <span style={{ background: cfg.bg, color: cfg.text, padding: '2px 7px', borderRadius: 99, fontSize: 10, fontWeight: 700 }}>
      {cfg.label}
    </span>
  )
}

function formatRelativeDate(date: Date): string {
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/* ------------------------------------------------------------------ */
/*  KPI Card — Studio-style gradient                                   */
/* ------------------------------------------------------------------ */

function KpiCard({ label, value, sub, color, onClick, active }: {
  label: string; value: string | number; sub?: string
  color: 'green' | 'amber' | 'red' | 'neutral' | 'teal'
  onClick?: () => void; active?: boolean
}) {
  const colors = {
    green:   { border: '#bbf7d0', bg: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)', text: '#15803d' },
    amber:   { border: '#fde68a', bg: 'linear-gradient(135deg, #fffbeb 0%, #fefce8 100%)', text: '#a16207' },
    red:     { border: '#fecaca', bg: 'linear-gradient(135deg, #fef2f2 0%, #fff1f2 100%)', text: '#dc2626' },
    neutral: { border: '#e8e6df', bg: '#fafaf8', text: '#1a1a1a' },
    teal:    { border: '#a7f3d0', bg: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdfa 100%)', text: '#0d9488' },
  }
  const c = colors[color]
  return (
    <div
      onClick={onClick}
      style={{ borderRadius: 10, border: `1.5px solid ${active ? c.text : c.border}`, background: c.bg, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4, cursor: onClick ? 'pointer' : 'default', transition: 'border-color 0.15s, box-shadow 0.15s', boxShadow: active ? `0 0 0 3px ${c.text}18` : 'none' }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.borderColor = c.text }}
      onMouseLeave={e => { if (onClick && !active) (e.currentTarget as HTMLDivElement).style.borderColor = c.border }}
    >
      <p style={{ fontSize: 11, fontWeight: 600, color: '#888', margin: 0, lineHeight: 1.3 }}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <p style={{ fontSize: 18, fontWeight: 700, color: c.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1, margin: 0 }}>{value}</p>
        {sub && <p style={{ fontSize: 10, color: '#aaa', margin: 0 }}>{sub}</p>}
        {onClick && <span style={{ marginLeft: 'auto', fontSize: 10, color: c.text, opacity: 0.6 }}>↓</span>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Pipeline Strip                                                     */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Recent Activity                                                    */
/* ------------------------------------------------------------------ */

interface ActivityItem {
  time: string
  event: string
  propertyName: string
  propertySlug: string
  color: string
}

function deriveRecentActivity(properties: Property[]): ActivityItem[] {
  const items: (ActivityItem & { _date: Date })[] = []
  const propertyColors = ['#1D9E75', '#D85A30', '#378ADD', '#D4537E', '#BA7517', '#534AB7']
  const colorMap: Record<string, string> = {}
  properties.forEach((p, i) => { colorMap[p.id] = propertyColors[i % propertyColors.length] })

  for (const property of properties) {
    const color = colorMap[property.id] ?? '#888'
    for (const unit of property.units) {
      // Rent payments
      for (const inv of unit.invoices) {
        if (inv.paymentTotal > 0) {
          const d = new Date(inv.dueDate)
          items.push({ _date: d, time: formatRelativeDate(d), event: `Rent received — ${unit.unitLabel}`, propertyName: property.name, propertySlug: property.slug, color })
        }
      }
      // Maintenance
      for (const req of unit.maintenanceRequests) {
        const d = new Date(req.createdAt)
        const label = req.status === 'OPEN' ? 'Maintenance opened' : req.status === 'IN_PROGRESS' ? 'Maintenance in progress' : 'Maintenance updated'
        items.push({ _date: d, time: formatRelativeDate(d), event: `${label} — ${unit.unitLabel}: ${req.title}`, propertyName: property.name, propertySlug: property.slug, color })
      }
      // Unread messages
      for (const msg of unit.recentMessages) {
        const d = new Date(msg.createdAt)
        items.push({ _date: d, time: formatRelativeDate(d), event: `Message from ${unit.tenant?.name ?? 'tenant'} — ${unit.unitLabel}`, propertyName: property.name, propertySlug: property.slug, color })
      }
    }
  }

  items.sort((a, b) => b._date.getTime() - a._date.getTime())
  return items.slice(0, 6).map(({ _date, ...rest }) => { void _date; return rest })
}

/* ------------------------------------------------------------------ */
/*  Occupancy Ring                                                     */
/* ------------------------------------------------------------------ */

function OccupancyRing({ pct }: { pct: number }) {
  const radius = 10; const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference
  return (
    <svg width="26" height="26" style={{ flexShrink: 0 }}>
      <circle cx="13" cy="13" r={radius} fill="none" stroke="#e8e6df" strokeWidth="2.5" />
      <circle cx="13" cy="13" r={radius} fill="none" stroke={pct >= 80 ? '#1D9E75' : pct >= 50 ? '#f59e0b' : '#ef4444'} strokeWidth="2.5"
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        transform="rotate(-90 13 13)"
      />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function PortfolioClient({ properties, kpis, isOnboarding = false, hasOverheadWorkspace = true }: {
  properties: Property[]; kpis: Kpis; isOnboarding?: boolean; hasOverheadWorkspace?: boolean
}) {
  const router = useRouter()
  const [propertyFilter, setPropertyFilter] = useState<PropertyFilter | null>(null)
  const [propertySearch, setPropertySearch] = useState('')
  const [expandedProperty, setExpandedProperty] = useState<string | null>(null)
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null)
  const [maintenanceModal, setMaintenanceModal] = useState<{ propertyId: string; unitId: string; unitLabel: string } | null>(null)
  const [messageModal, setMessageModal] = useState<{ propertyId: string; unitId: string; tenantId: string; tenantName: string; unitLabel: string } | null>(null)
  const [creatingOverhead, setCreatingOverhead] = useState(false)
  const cardsRef = useRef<HTMLDivElement>(null)

  const occupancyPct = kpis.totalUnits > 0 ? Math.round((kpis.leasedUnits / kpis.totalUnits) * 100) : 0

  /* Notices (Studio pattern) */
  const notices = useMemo(() => {
    const items: { dot: string; label: string; detail: string; onClick?: () => void }[] = []

    if (kpis.overduePayments > 0) items.push({
      dot: '#ef4444',
      label: `${kpis.overduePayments} unit${kpis.overduePayments !== 1 ? 's' : ''} with overdue rent`,
      detail: 'Rent balance is outstanding — follow up with tenants',
      onClick: () => {
        const next = propertyFilter === 'RENT_OVERDUE' ? null : 'RENT_OVERDUE' as PropertyFilter
        setPropertyFilter(next)
        if (next) {
          const first = properties.find(p => p.units.some(u => hasOverdueRent(u)))
          if (first) setExpandedProperty(first.id)
        }
        setTimeout(() => document.getElementById('portfolio-cards')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
      },
    })

    if (kpis.expiringLeases > 0) items.push({
      dot: '#f59e0b',
      label: `${kpis.expiringLeases} lease${kpis.expiringLeases !== 1 ? 's' : ''} expiring within 90 days`,
      detail: 'Reach out to tenants about renewal or vacating',
      onClick: () => {
        const next = propertyFilter === 'EXPIRING' ? null : 'EXPIRING' as PropertyFilter
        setPropertyFilter(next)
        if (next) {
          const first = properties.find(p => p.units.some(u => getLeaseUrgency(u.leaseEndDate) !== null))
          if (first) setExpandedProperty(first.id)
        }
        setTimeout(() => document.getElementById('portfolio-cards')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
      },
    })

    if (kpis.openMaintenance > 0) items.push({
      dot: '#f97316',
      label: `${kpis.openMaintenance} open maintenance request${kpis.openMaintenance !== 1 ? 's' : ''}`,
      detail: 'Review and schedule outstanding work orders',
      onClick: () => {
        const next = propertyFilter === 'MAINTENANCE_OPEN' ? null : 'MAINTENANCE_OPEN' as PropertyFilter
        setPropertyFilter(next)
        if (next) {
          const first = properties.find(p => p.units.some(u => u.openMaintenance > 0))
          if (first) setExpandedProperty(first.id)
        }
        setTimeout(() => document.getElementById('portfolio-cards')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
      },
    })

    if (kpis.activeApplicants > 0) items.push({
      dot: '#3b82f6',
      label: `${kpis.activeApplicants} active applicant${kpis.activeApplicants !== 1 ? 's' : ''} in the pipeline`,
      detail: 'Review applications and move candidates forward',
      onClick: () => { if (properties[0]) router.push(`/projects/${properties[0].slug}`) },
    })

    if ((kpis.recentPaymentsCount ?? 0) > 0) items.push({
      dot: '#16a34a',
      label: `${kpis.recentPaymentsCount} rent payment${kpis.recentPaymentsCount !== 1 ? 's' : ''} received in the last 7 days`,
      detail: 'Confirm payments have been applied correctly',
    })

    return items
  }, [kpis, properties, propertyFilter, router])

  const activity = useMemo(() => deriveRecentActivity(properties), [properties])

  /* Filter logic */
  function matchesFilter(unit: Unit): boolean {
    if (!propertyFilter || propertyFilter === 'ALL') return true
    if (propertyFilter === 'EXPIRING') return getLeaseUrgency(unit.leaseEndDate) !== null
    if (propertyFilter === 'MAINTENANCE_OPEN') return unit.openMaintenance > 0
    if (propertyFilter === 'RENT_OVERDUE') return hasOverdueRent(unit)
    if (propertyFilter === 'UNREAD_MESSAGES') return unit.unreadMessages > 0
    if (propertyFilter === 'VACANT') return unit.status === 'VACANT'
    return true
  }

  const filteredProperties = properties.filter(p => {
    const q = propertySearch.toLowerCase()
    const nameMatch = !q || p.name.toLowerCase().includes(q) || (p.address ?? '').toLowerCase().includes(q) || (p.city ?? '').toLowerCase().includes(q)
    if (!nameMatch) return false
    if (!propertyFilter || propertyFilter === 'ALL') return true
    return p.units.some(u => matchesFilter(u))
  })

  async function updateMaintenanceStatus(propertyId: string, requestId: string, newStatus: string) {
    await fetch(`/api/projects/${propertyId}/maintenance/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    router.refresh()
  }

  /* ---- Empty state ---- */
  if (properties.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>No active properties</p>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>Create a property project to start tracking units, tenants, leases, and maintenance.</p>
        <Link href="/projects/new" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, background: '#1D9E75', padding: '10px 20px', fontSize: 13, fontWeight: 600, color: '#fff', textDecoration: 'none' }}>
          Add property
        </Link>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'inherit', maxWidth: 960, color: '#1a1a1a' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Onboarding banner */}
      {isOnboarding && properties.length === 0 && (
        <OnboardingBanner
          message="Add your first property to start managing units and tenants."
          actionLabel="Add Property"
          actionHref="/projects/new?type=PROPERTY"
          onSkip={() => router.replace('/portfolio')}
        />
      )}

      {/* Overhead workspace prompt */}
      {!isOnboarding && !hasOverheadWorkspace && (
        <ActionBanner
          icon="📌"
          label="Track property overhead"
          detail="Set up a shared workspace for expenses not tied to a specific property — insurance, management fees, shared maintenance costs."
          color="blue"
          onClick={async () => {
            if (creatingOverhead) return
            setCreatingOverhead(true)
            await fetch('/api/projects', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: 'Property Overhead', type: 'OTHER', isDefault: true }),
            })
            router.refresh()
          }}
          cta={creatingOverhead ? 'Setting up…' : 'Set up →'}
        />
      )}

      {/* ============================================================= */}
      {/*  KPI BAR                                                       */}
      {/* ============================================================= */}

      <div style={{ display: 'flex', gap: 16, marginBottom: 8, alignItems: 'stretch' }}>
        {/* Group 1: core portfolio metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, flex: '6 1 0' }}>
          <KpiCard label="Units" value={kpis.totalUnits} color="neutral" />
          <KpiCard
            label="Occupancy"
            value={`${occupancyPct}%`}
            sub={`${kpis.leasedUnits} leased`}
            color={occupancyPct >= 80 ? 'teal' : occupancyPct >= 50 ? 'amber' : 'red'}
          />
          <KpiCard label="Revenue/mo" value={fmt(kpis.monthlyRevenue)} color={kpis.monthlyRevenue > 0 ? 'teal' : 'neutral'} />
          <KpiCard
            label="Leased"
            value={kpis.leasedUnits}
            color={kpis.leasedUnits > 0 ? 'teal' : 'neutral'}
          />
          <KpiCard
            label="Vacant"
            value={kpis.vacantUnits}
            color={kpis.vacantUnits > 0 ? 'amber' : 'neutral'}
            active={propertyFilter === 'VACANT'}
            onClick={kpis.vacantUnits > 0 ? () => {
              const next = propertyFilter === 'VACANT' ? null : 'VACANT' as PropertyFilter
              setPropertyFilter(next)
              setTimeout(() => document.getElementById('portfolio-cards')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
            } : undefined}
          />
          <KpiCard
            label="Applicants"
            value={kpis.activeApplicants}
            color={kpis.activeApplicants > 0 ? 'neutral' : 'neutral'}
          />
        </div>

        {/* Divider */}
        <div style={{ width: 1, background: '#e5e7eb', alignSelf: 'stretch', flexShrink: 0 }} />

        {/* Group 2: alert metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, flex: '3 1 0' }}>
          <KpiCard
            label="Rent overdue"
            value={kpis.overduePayments}
            color={kpis.overduePayments > 0 ? 'red' : 'neutral'}
            active={propertyFilter === 'RENT_OVERDUE'}
            onClick={kpis.overduePayments > 0 ? () => {
              const next = propertyFilter === 'RENT_OVERDUE' ? null : 'RENT_OVERDUE' as PropertyFilter
              setPropertyFilter(next)
              setTimeout(() => document.getElementById('portfolio-cards')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
            } : undefined}
          />
          <KpiCard
            label="Expiring ≤90d"
            value={kpis.expiringLeases}
            color={kpis.expiringLeases > 0 ? 'red' : 'neutral'}
            active={propertyFilter === 'EXPIRING'}
            onClick={kpis.expiringLeases > 0 ? () => {
              const next = propertyFilter === 'EXPIRING' ? null : 'EXPIRING' as PropertyFilter
              setPropertyFilter(next)
              setTimeout(() => document.getElementById('portfolio-cards')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
            } : undefined}
          />
          <KpiCard
            label="Maintenance"
            value={kpis.openMaintenance}
            color={kpis.openMaintenance > 0 ? 'amber' : 'neutral'}
            active={propertyFilter === 'MAINTENANCE_OPEN'}
            onClick={kpis.openMaintenance > 0 ? () => {
              const next = propertyFilter === 'MAINTENANCE_OPEN' ? null : 'MAINTENANCE_OPEN' as PropertyFilter
              setPropertyFilter(next)
              setTimeout(() => document.getElementById('portfolio-cards')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
            } : undefined}
          />
        </div>
      </div>

      {/* ============================================================= */}
      {/* ============================================================= */}
      {/*  3-COL STRIP: Take action | Take notice | Recent activity      */}
      {/* ============================================================= */}

      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: 16, marginBottom: 24, alignItems: 'start' }}>

        {/* Take action */}
        <div style={{ border: '1.5px solid #e0ddd5', borderRadius: 10, padding: '10px 12px', background: '#fafaf8' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingLeft: 2 }}>Take action</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
            {[
              { label: 'Add property', onClick: () => router.push('/projects/new?type=PROPERTY') },
              { label: 'Log rent',     onClick: () => { if (properties[0]) router.push(`/projects/${properties[0].slug}/invoices/new`) } },
              { label: 'Add unit',     onClick: () => { if (properties[0]) router.push(`/projects/${properties[0].slug}/units/new`) } },
              { label: 'Maintenance',  onClick: () => {
                const first = properties[0]
                const firstUnit = first?.units[0]
                if (first && firstUnit) setMaintenanceModal({ propertyId: first.id, unitId: firstUnit.id, unitLabel: firstUnit.unitLabel })
              }},
              { label: 'Send message', onClick: () => {
                const first = properties[0]
                const unit = first?.units.find(u => u.tenant)
                if (first && unit && unit.tenant) setMessageModal({ propertyId: first.id, unitId: unit.id, tenantId: unit.tenant.id, tenantName: unit.tenant.name, unitLabel: unit.unitLabel })
              }},
              { label: 'All properties', onClick: () => router.push('/projects') },
            ].map(item => (
              <button
                key={item.label}
                onClick={item.onClick}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 99, whiteSpace: 'nowrap',
                  border: '1.5px solid #e0ddd5', background: 'transparent',
                  padding: '5px 12px', fontSize: 11, fontWeight: 600,
                  color: '#555', cursor: 'pointer',
                }}
              >
                <Plus size={11} />
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Take notice */}
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingLeft: 2 }}>Take notice</p>
          {notices.length > 0 ? (
            <div style={{ borderRadius: 10, border: '1px solid #e8e6df', background: '#fff', overflow: 'hidden' }}>
              {notices.map((item, i) => {
                const isActive = (
                  (item.label.includes('overdue rent') && propertyFilter === 'RENT_OVERDUE') ||
                  (item.label.includes('expiring') && propertyFilter === 'EXPIRING') ||
                  (item.label.includes('maintenance') && propertyFilter === 'MAINTENANCE_OPEN')
                )
                return (
                  <div
                    key={i}
                    onClick={item.onClick}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 12px', borderBottom: i < notices.length - 1 ? '1px solid #f5f4f0' : 'none', cursor: item.onClick ? 'pointer' : 'default', background: isActive ? '#f0fdf4' : 'transparent', transition: 'background 0.1s' }}
                    onMouseEnter={e => { if (item.onClick) (e.currentTarget as HTMLDivElement).style.background = isActive ? '#dcfce7' : '#fafaf8' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isActive ? '#f0fdf4' : 'transparent' }}
                  >
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: item.dot, flexShrink: 0, marginTop: 4 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, margin: 0, lineHeight: 1.3, color: '#1a1a1a' }}>{item.label}</p>
                      <p style={{ fontSize: 11, color: '#888', margin: '1px 0 0', lineHeight: 1.3 }}>{item.detail}</p>
                    </div>
                    {item.onClick && <span style={{ fontSize: 10, color: '#bbb', flexShrink: 0, marginTop: 3 }}>→</span>}
                  </div>
                )
              })}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: '#bbb', paddingLeft: 2, margin: 0 }}>All clear</p>
          )}
        </div>

        {/* Recent activity */}
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingLeft: 2 }}>Recent activity</p>
          {activity.length === 0 ? (
            <p style={{ fontSize: 12, color: '#bbb', paddingLeft: 2, margin: 0 }}>No activity yet</p>
          ) : (
            <div style={{ borderRadius: 10, border: '1px solid #e8e6df', background: '#fff', overflow: 'hidden' }}>
              {activity.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 12px', borderBottom: i < activity.length - 1 ? '1px solid #f5f4f0' : 'none' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: item.color, flexShrink: 0, marginTop: 4 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 500, margin: 0, lineHeight: 1.3, color: '#1a1a1a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.event}</p>
                    <div style={{ display: 'flex', gap: 6, marginTop: 1 }}>
                      <Link href={`/projects/${item.propertySlug}`} style={{ fontSize: 11, color: '#888', textDecoration: 'none' }}>{item.propertyName}</Link>
                      <span style={{ fontSize: 11, color: '#ccc' }}>·</span>
                      <span style={{ fontSize: 11, color: '#bbb' }}>{item.time}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* ============================================================= */}
      {/*  PROPERTY CARDS                                                */}
      {/* ============================================================= */}

      <div id="portfolio-cards" ref={cardsRef}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, margin: 0, paddingLeft: 4 }}>Properties</p>
            {propertyFilter && (
              <button
                onClick={() => setPropertyFilter(null)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600,
                  color: propertyFilter === 'RENT_OVERDUE' ? '#dc2626' : propertyFilter === 'EXPIRING' ? '#a16207' : '#0d9488',
                  background: propertyFilter === 'RENT_OVERDUE' ? '#fef2f2' : propertyFilter === 'EXPIRING' ? '#fffbeb' : '#f0fdfa',
                  border: `1px solid ${propertyFilter === 'RENT_OVERDUE' ? '#fecaca' : propertyFilter === 'EXPIRING' ? '#fde68a' : '#a7f3d0'}`,
                  borderRadius: 99, padding: '2px 8px', cursor: 'pointer'
                }}
              >
                {propertyFilter === 'RENT_OVERDUE' ? 'Rent overdue' : propertyFilter === 'EXPIRING' ? 'Expiring leases' : propertyFilter === 'MAINTENANCE_OPEN' ? 'Open maintenance' : propertyFilter === 'VACANT' ? 'Vacant' : propertyFilter === 'UNREAD_MESSAGES' ? 'Unread messages' : propertyFilter} ✕
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#bbb', pointerEvents: 'none' }}>
                <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <input
                value={propertySearch}
                onChange={e => setPropertySearch(e.target.value)}
                placeholder="Search properties, tenants…"
                style={{ paddingLeft: 28, paddingRight: 10, paddingTop: 6, paddingBottom: 6, borderRadius: 8, border: '1px solid #e8e6df', background: '#fafaf8', fontSize: 12, outline: 'none', width: 220, color: '#1a1a1a' }}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filteredProperties.map(property => {
            const isExpanded = expandedProperty === property.id
            const units = propertyFilter ? property.units.filter(u => matchesFilter(u)) : property.units
            const leasedCount = property.units.filter(u => u.status === 'LEASED').length
            const propOccupancyPct = property.units.length > 0 ? Math.round((leasedCount / property.units.length) * 100) : 0
            const propRevenue = property.units.filter(u => u.status === 'LEASED' && u.monthlyRent).reduce((s, u) => s + (u.monthlyRent ?? 0), 0)
            const propExpiring = property.units.filter(u => getLeaseUrgency(u.leaseEndDate) !== null).length
            const propOverdue = property.units.filter(u => hasOverdueRent(u)).length
            const propMaintenance = property.units.reduce((s, u) => s + u.openMaintenance, 0)
            const hasUrgency = propOverdue > 0 || propExpiring > 0

            return (
              <div
                key={property.id}
                style={{ borderRadius: 14, border: `1px solid ${isExpanded ? '#a7f3d0' : '#e8e6df'}`, background: '#fff', overflow: 'hidden', transition: 'border-color 0.15s' }}
              >
                {/* Card header */}
                <div
                  onClick={() => { setExpandedProperty(isExpanded ? null : property.id); setExpandedUnit(null) }}
                  style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto auto auto auto auto', alignItems: 'center', gap: 16, padding: '8px 14px', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => { if (!isExpanded) (e.currentTarget as HTMLDivElement).style.background = '#fafaf8' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                >
                  {/* Identity */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: hasUrgency ? '#fef2f2' : '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: hasUrgency ? '#dc2626' : '#1D9E75', flexShrink: 0 }}>
                      {property.name[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{property.name}</p>
                      {(property.address || property.city) && (
                        <p style={{ fontSize: 11, color: '#aaa', margin: 0 }}>
                          {[property.address, property.city].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Occupancy */}
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 10, color: '#aaa', margin: '0 0 1px', whiteSpace: 'nowrap' }}>Occupancy</p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                      <OccupancyRing pct={propOccupancyPct} />
                      <p style={{ fontSize: 14, fontWeight: 600, margin: 0, fontVariantNumeric: 'tabular-nums', color: propOccupancyPct >= 80 ? '#0d9488' : propOccupancyPct >= 50 ? '#a16207' : '#dc2626' }}>
                        {propOccupancyPct}%
                      </p>
                    </div>
                  </div>

                  {/* Revenue */}
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 10, color: '#aaa', margin: '0 0 1px', whiteSpace: 'nowrap' }}>Revenue/mo</p>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: 0, fontVariantNumeric: 'tabular-nums', color: propRevenue > 0 ? '#0d9488' : '#aaa' }}>
                      {propRevenue > 0 ? fmt(propRevenue) : '—'}
                    </p>
                  </div>

                  {/* Expiring */}
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 10, color: '#aaa', margin: '0 0 1px', whiteSpace: 'nowrap' }}>Expiring</p>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: propExpiring > 0 ? '#a16207' : '#aaa' }}>
                      {propExpiring || '—'}
                    </p>
                  </div>

                  {/* Rent overdue */}
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 10, color: '#aaa', margin: '0 0 1px', whiteSpace: 'nowrap' }}>Overdue</p>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: propOverdue > 0 ? '#dc2626' : '#aaa' }}>
                      {propOverdue || '—'}
                    </p>
                  </div>

                  {/* Maintenance */}
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 10, color: '#aaa', margin: '0 0 1px', whiteSpace: 'nowrap' }}>Maintenance</p>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: propMaintenance > 0 ? '#f97316' : '#aaa' }}>
                      {propMaintenance || '—'}
                    </p>
                  </div>

                  {/* Units count */}
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 10, color: '#aaa', margin: '0 0 1px', whiteSpace: 'nowrap' }}>Units</p>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: '#1a1a1a' }}>
                      {property.units.length}
                    </p>
                  </div>

                  {/* Chevron */}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: '#bbb', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
                    <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #f0eeeb', background: '#fafaf8', padding: '16px 18px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: propertyFilter ? '1fr' : '1fr 200px', gap: 20 }}>

                      {/* Left: unit list */}
                      <div>
                        <p style={{ fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 8px' }}>
                          Units {units.length !== property.units.length && `(${units.length} of ${property.units.length})`}
                        </p>
                        {units.length === 0 ? (
                          <p style={{ fontSize: 12, color: '#bbb' }}>No units match current filter.</p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {units.map(unit => {
                              const isUnitExpanded = expandedUnit === unit.id
                              const urgency = getLeaseUrgency(unit.leaseEndDate)
                              const balance = getBalance(unit)
                              const days = unit.leaseEndDate ? daysUntil(unit.leaseEndDate) : null

                              return (
                                <div key={unit.id}>
                                  {/* Unit row */}
                                  <div
                                    onClick={() => setExpandedUnit(isUnitExpanded ? null : unit.id)}
                                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: isUnitExpanded ? '10px 10px 0 0' : 10, background: '#fff', border: `1px solid ${isUnitExpanded ? '#a7f3d0' : '#e8e6df'}`, cursor: 'pointer', transition: 'border-color 0.15s' }}
                                    onMouseEnter={e => { if (!isUnitExpanded) (e.currentTarget as HTMLDivElement).style.borderColor = '#a7f3d0' }}
                                    onMouseLeave={e => { if (!isUnitExpanded) (e.currentTarget as HTMLDivElement).style.borderColor = '#e8e6df' }}
                                  >
                                    {isUnitExpanded
                                      ? <ChevronDown size={13} style={{ color: '#1D9E75', flexShrink: 0 }} />
                                      : <ChevronRight size={13} style={{ color: '#bbb', flexShrink: 0 }} />
                                    }
                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1D9E75', flexShrink: 0 }}>{unit.unitLabel}</span>

                                    {/* Status badge */}
                                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: '#f3f4f6', color: '#6b7280', flexShrink: 0 }}>
                                      {UNIT_STATUS_LABELS[unit.status] ?? unit.status}
                                    </span>

                                    {/* Tenant */}
                                    <span style={{ fontSize: 12, color: '#555', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                      {unit.tenant?.name ?? <span style={{ color: '#ccc' }}>Vacant</span>}
                                    </span>

                                    {/* Lease end urgency */}
                                    {urgency && days !== null && (
                                      <span style={{ fontSize: 10, fontWeight: 700, color: urgency === 'critical' ? '#dc2626' : '#a16207', flexShrink: 0 }}>
                                        {days}d
                                      </span>
                                    )}

                                    {/* Balance */}
                                    {unit.invoices.some(inv => inv.status !== 'VOID') && (
                                      <span style={{ fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: balance > 0 ? '#dc2626' : '#16a34a', flexShrink: 0 }}>
                                        {balance > 0 ? `+${fmt(balance)}` : balance < 0 ? `-${fmt(Math.abs(balance))}` : 'Clear'}
                                      </span>
                                    )}

                                    {/* Payment status */}
                                    <PaymentStatusBadge unit={unit} />

                                    {/* Maintenance badge */}
                                    {unit.openMaintenance > 0 && (
                                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: '#ffedd5', color: '#c2410c', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
                                        {unit.openMaintenance}
                                      </span>
                                    )}

                                    {/* Unread message badge */}
                                    {unit.unreadMessages > 0 && (
                                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: '#dbeafe', color: '#1d4ed8', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
                                        {unit.unreadMessages}
                                      </span>
                                    )}
                                  </div>

                                  {/* Expanded unit detail panel */}
                                  {isUnitExpanded && (
                                    <div style={{ borderRadius: '0 0 10px 10px', border: '1px solid #a7f3d0', borderTop: 'none' }}>
                                      <ExpandedPanel
                                        unit={unit}
                                        property={property}
                                        onCreateMaintenance={() => setMaintenanceModal({ propertyId: property.id, unitId: unit.id, unitLabel: unit.unitLabel })}
                                        onSendMessage={() => {
                                          if (unit.tenant) setMessageModal({ propertyId: property.id, unitId: unit.id, tenantId: unit.tenant.id, tenantName: unit.tenant.name, unitLabel: unit.unitLabel })
                                        }}
                                        onMaintenanceStatusChange={(reqId, s) => updateMaintenanceStatus(property.id, reqId, s)}
                                      />
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {/* Right: quick actions — hidden when filter active */}
                      {!propertyFilter && (
                        <div>
                          <p style={{ fontSize: 10, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 8px' }}>Quick actions</p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {[
                              { label: 'Log rent', action: () => router.push(`/projects/${property.slug}/invoices/new`) },
                              { label: 'Add unit', action: () => router.push(`/projects/${property.slug}/units/new`) },
                              { label: 'New maintenance', action: () => {
                                const firstUnit = property.units[0]
                                if (firstUnit) setMaintenanceModal({ propertyId: property.id, unitId: firstUnit.id, unitLabel: firstUnit.unitLabel })
                              }},
                              { label: 'Send message', action: () => {
                                const unit = property.units.find(u => u.tenant)
                                if (unit && unit.tenant) setMessageModal({ propertyId: property.id, unitId: unit.id, tenantId: unit.tenant.id, tenantName: unit.tenant.name, unitLabel: unit.unitLabel })
                              }},
                              { label: 'View property →', action: () => router.push(`/projects/${property.slug}`) },
                            ].map(item => (
                              <button
                                key={item.label}
                                onClick={e => { e.stopPropagation(); item.action() }}
                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 10, border: '1px solid #e8e6df', background: '#fff', fontSize: 12, fontWeight: 500, color: '#555', cursor: 'pointer', transition: 'all 0.15s' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#1D9E75'; (e.currentTarget as HTMLButtonElement).style.color = '#1D9E75' }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e8e6df'; (e.currentTarget as HTMLButtonElement).style.color = '#555' }}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {filteredProperties.length === 0 && (
            <div style={{ borderRadius: 14, border: '1.5px dashed #e8e6df', padding: '40px 0', textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: '#bbb', margin: 0 }}>No properties match your filters.</p>
              <button onClick={() => { setPropertyFilter(null); setPropertySearch('') }} style={{ fontSize: 12, color: '#1D9E75', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4 }}>
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>

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
/*  Expanded detail panel                                                */
/* ==================================================================== */

function ExpandedPanel({ unit, property, onCreateMaintenance, onSendMessage, onMaintenanceStatusChange }: {
  unit: Unit; property: Property
  onCreateMaintenance: () => void; onSendMessage: () => void
  onMaintenanceStatusChange: (reqId: string, status: string) => void
}) {
  const urgency = getLeaseUrgency(unit.leaseEndDate)
  const days = unit.leaseEndDate ? daysUntil(unit.leaseEndDate) : null
  const activeInvoices = unit.invoices.filter(inv => inv.status !== 'VOID')
  const charged = activeInvoices.reduce((s, inv) => s + inv.lineItemTotal, 0)
  const paid = activeInvoices.reduce((s, inv) => s + inv.paymentTotal, 0)
  const balance = charged - paid

  const URGENCY_STYLES: Record<string, string> = {
    critical: 'bg-red-50 border-red-200 text-red-700',
    warning: 'bg-amber-50 border-amber-200 text-amber-700',
    soon: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  }

  return (
    <div className="bg-muted/5 px-4 py-4">
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
              {unit.leaseMonthlyRent && <div className="flex justify-between"><span className="text-muted-foreground">Rent</span><span className="font-medium">{fmtFull(unit.leaseMonthlyRent)}/mo</span></div>}
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
                {activeInvoices.slice(0, 3).map(inv => (
                  <div key={inv.id} className="flex items-center gap-2 text-xs">
                    {inv.period && <span className="text-muted-foreground shrink-0">{inv.period}</span>}
                    <span className="font-medium tabular-nums ml-auto">
                      {inv.lineItemTotal - inv.paymentTotal > 0
                        ? <span className="text-amber-700">{fmtFull(inv.lineItemTotal - inv.paymentTotal)} owed</span>
                        : <span className="text-green-700">Paid</span>
                      }
                    </span>
                  </div>
                ))}
              </div>
              <Link href={`/projects/${property.slug}/units/${unit.id}`} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                <ExternalLink className="h-3 w-3" /> Full ledger
              </Link>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">No ledger records</p>
              <Link href={`/projects/${property.slug}/units/${unit.id}`} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                <ExternalLink className="h-3 w-3" /> Full ledger
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
                  <Send className="h-3.5 w-3.5" /> New
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
