'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Wrench, Building2 } from 'lucide-react'
import { UNIT_STATUS_COLORS, UNIT_STATUS_LABELS } from '@/types'
import { cn } from '@/lib/utils'

interface Unit {
  id: string
  unitLabel: string
  status: string
  monthlyRent: number | null
  bedrooms: number | null
  bathrooms: number | null
  tenant: { id: string; name: string } | null
  leaseEndDate: string | null
  openMaintenance: number
}

interface Property {
  id: string
  name: string
  slug: string
  units: Unit[]
}

interface Kpis {
  totalUnits: number
  leasedUnits: number
  vacantUnits: number
  openMaintenance: number
  monthlyRevenue: number
}

const STATUS_FILTERS = ['ALL', 'LEASED', 'VACANT', 'NOTICE_GIVEN', 'PREPARING', 'LISTED'] as const
type StatusFilter = typeof STATUS_FILTERS[number]

const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

export function PortfolioClient({ properties, kpis }: { properties: Property[]; kpis: Kpis }) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')

  const occupancyPct = kpis.totalUnits > 0 ? Math.round((kpis.leasedUnits / kpis.totalUnits) * 100) : 0

  const filteredProperties = properties
    .map(p => ({
      ...p,
      units: statusFilter === 'ALL' ? p.units : p.units.filter(u => u.status === statusFilter),
    }))
    .filter(p => p.units.length > 0)

  if (properties.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Building2 className="h-10 w-10 mb-3 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No active properties yet.</p>
        <p className="text-xs text-muted-foreground mt-1">
          <Link href="/projects/new" className="underline">Create a property project</Link> to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total units', value: kpis.totalUnits },
          { label: 'Occupancy', value: `${occupancyPct}%` },
          { label: 'Leased', value: kpis.leasedUnits },
          { label: 'Vacant', value: kpis.vacantUnits },
          { label: 'Monthly revenue', value: fmt(kpis.monthlyRevenue) },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-lg border px-4 py-3">
            <p className="text-xs text-muted-foreground mb-0.5">{kpi.label}</p>
            <p className="text-xl font-semibold">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Open maintenance callout */}
      {kpis.openMaintenance > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm text-orange-800">
          <Wrench className="h-4 w-4 shrink-0" />
          <span>{kpis.openMaintenance} open maintenance request{kpis.openMaintenance !== 1 ? 's' : ''} across your portfolio</span>
        </div>
      )}

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              statusFilter === s
                ? 'bg-primary text-primary-foreground'
                : 'border hover:bg-muted/50 text-muted-foreground'
            )}
          >
            {s === 'ALL' ? 'All' : (UNIT_STATUS_LABELS[s] ?? s)}
          </button>
        ))}
      </div>

      {/* Properties */}
      {filteredProperties.length === 0 ? (
        <p className="text-sm text-muted-foreground">No units match this filter.</p>
      ) : (
        <div className="space-y-6">
          {filteredProperties.map(property => {
            const leased = property.units.filter(u => u.status === 'LEASED').length
            const total = property.units.length
            return (
              <div key={property.id}>
                {/* Property header */}
                <div className="flex items-baseline justify-between mb-2">
                  <Link
                    href={`/projects/${property.slug}`}
                    className="text-sm font-semibold hover:underline"
                  >
                    {property.name}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {leased}/{total} leased
                  </span>
                </div>

                {/* Compact unit rows */}
                <div className="rounded-lg border divide-y">
                  {property.units.map(unit => (
                    <Link
                      key={unit.id}
                      href={`/projects/${property.slug}/units/${unit.id}`}
                      className="flex items-center gap-4 px-4 py-2.5 hover:bg-muted/20 transition-colors text-sm"
                    >
                      {/* Unit label */}
                      <span className="w-24 font-medium shrink-0 truncate">{unit.unitLabel}</span>

                      {/* Status badge */}
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium shrink-0',
                        UNIT_STATUS_COLORS[unit.status] ?? 'bg-muted text-muted-foreground'
                      )}>
                        {UNIT_STATUS_LABELS[unit.status] ?? unit.status}
                      </span>

                      {/* Tenant */}
                      <span className="flex-1 text-muted-foreground truncate">
                        {unit.tenant?.name ?? '—'}
                      </span>

                      {/* Lease end */}
                      {unit.leaseEndDate ? (
                        <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                          ends {new Date(unit.leaseEndDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">—</span>
                      )}

                      {/* Rent */}
                      <span className="text-xs font-medium shrink-0 w-20 text-right">
                        {unit.monthlyRent ? fmt(unit.monthlyRent) : '—'}
                      </span>

                      {/* Maintenance */}
                      {unit.openMaintenance > 0 ? (
                        <span className="flex items-center gap-1 text-xs text-orange-600 shrink-0">
                          <Wrench className="h-3 w-3" />
                          {unit.openMaintenance}
                        </span>
                      ) : (
                        <span className="w-8 shrink-0" />
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
