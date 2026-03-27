'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { UnitCard } from './unit-card'
import { UNIT_STATUS_LABELS } from '@/types'

const STATUS_COLUMNS = ['LEASED', 'NOTICE_GIVEN', 'VACANT', 'PREPARING', 'MAINTENANCE', 'LISTED'] as const
type UnitStatus = typeof STATUS_COLUMNS[number]

interface UnitData {
  id: string
  unitLabel: string
  status: string
  monthlyRent: number | null
  bedrooms: number | null
  bathrooms: number | null
  leases: Array<{ tenant: { name: string }; endDate: string }>
  _count: { maintenanceRequests: number }
}

interface Props {
  projectId: string
  slug: string
  units: UnitData[]
}

export function UnitBoard({ projectId, slug, units }: Props) {
  const [localUnits, setLocalUnits] = useState<UnitData[]>(units)
  const [addingToStatus, setAddingToStatus] = useState<UnitStatus | null>(null)
  const [newUnitLabel, setNewUnitLabel] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const grouped = STATUS_COLUMNS.reduce<Record<string, UnitData[]>>((acc, status) => {
    acc[status] = localUnits.filter(u => u.status === status)
    return acc
  }, {} as Record<string, UnitData[]>)

  async function handleAddUnit(status: UnitStatus) {
    if (!newUnitLabel.trim()) return
    setAdding(true)
    setError(null)

    try {
      const res = await fetch(`/api/projects/${projectId}/units`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitLabel: newUnitLabel, status }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? 'Failed to add unit')
        return
      }
      setLocalUnits(prev => [...prev, { ...json.data, leases: [], _count: { maintenanceRequests: 0 } }])
      setNewUnitLabel('')
      setAddingToStatus(null)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold">{localUnits.length} unit{localUnits.length !== 1 ? 's' : ''}</h2>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {STATUS_COLUMNS.map(status => (
          <div key={status} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {UNIT_STATUS_LABELS[status]}
              </span>
              <span className="text-xs text-muted-foreground">{grouped[status].length}</span>
            </div>

            <div className="min-h-20 rounded-lg border border-dashed p-2 flex flex-col gap-2">
              {grouped[status].map(unit => (
                <UnitCard key={unit.id} unit={unit} slug={slug} />
              ))}

              {status === 'VACANT' && (
                addingToStatus === 'VACANT' ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newUnitLabel}
                      onChange={e => setNewUnitLabel(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleAddUnit('VACANT')
                        if (e.key === 'Escape') { setAddingToStatus(null); setNewUnitLabel('') }
                      }}
                      className="flex-1 rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Unit label"
                      autoFocus
                      disabled={adding}
                    />
                    <button
                      type="button"
                      onClick={() => handleAddUnit('VACANT')}
                      disabled={adding || !newUnitLabel.trim()}
                      className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAddingToStatus(null); setNewUnitLabel('') }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingToStatus('VACANT')}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    Add unit
                  </button>
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
