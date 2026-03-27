'use client'

import Link from 'next/link'
import { Wrench } from 'lucide-react'
import { UNIT_STATUS_COLORS, UNIT_STATUS_LABELS } from '@/types'
import { cn } from '@/lib/utils'

interface UnitCardProps {
  unit: {
    id: string
    unitLabel: string
    status: string
    monthlyRent: number | null
    bedrooms: number | null
    bathrooms: number | null
    leases: Array<{ tenant: { name: string }; endDate: string }>
    _count: { maintenanceRequests: number }
  }
  slug: string
}

export function UnitCard({ unit, slug }: UnitCardProps) {
  const activeLease = unit.leases[0]

  return (
    <Link
      href={`/projects/${slug}/units/${unit.id}`}
      className="block rounded-lg border bg-background p-3 hover:border-primary hover:shadow-sm transition-all text-sm"
    >
      <div className="flex items-start justify-between mb-2">
        <span className="font-medium">{unit.unitLabel}</span>
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', UNIT_STATUS_COLORS[unit.status] ?? 'bg-muted text-muted-foreground')}>
          {UNIT_STATUS_LABELS[unit.status] ?? unit.status}
        </span>
      </div>

      {(unit.bedrooms !== null || unit.bathrooms !== null) && (
        <p className="text-xs text-muted-foreground mb-1">
          {unit.bedrooms !== null ? `${unit.bedrooms} bed` : ''}
          {unit.bedrooms !== null && unit.bathrooms !== null ? ' / ' : ''}
          {unit.bathrooms !== null ? `${unit.bathrooms} bath` : ''}
        </p>
      )}

      {unit.monthlyRent !== null && (
        <p className="text-xs font-medium mb-1">
          ${Number(unit.monthlyRent).toLocaleString()}/mo
        </p>
      )}

      {activeLease?.tenant && (
        <p className="text-xs text-muted-foreground truncate">{activeLease.tenant.name}</p>
      )}

      {activeLease?.endDate && (
        <p className="text-xs text-muted-foreground">
          Ends {new Date(activeLease.endDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
        </p>
      )}

      {unit._count.maintenanceRequests > 0 && (
        <div className="flex items-center gap-1 mt-2 text-xs text-orange-600">
          <Wrench className="h-3 w-3" />
          {unit._count.maintenanceRequests} open request{unit._count.maintenanceRequests !== 1 ? 's' : ''}
        </div>
      )}
    </Link>
  )
}
