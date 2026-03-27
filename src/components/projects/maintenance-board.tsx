'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { MAINTENANCE_PRIORITY_COLORS, MAINTENANCE_PRIORITY_LABELS, MAINTENANCE_STATUS_LABELS } from '@/types'
import { MaintenanceForm } from './maintenance-form'
import { cn } from '@/lib/utils'

const STATUS_COLUMNS = ['OPEN', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const
type MaintStatus = typeof STATUS_COLUMNS[number]

interface Request {
  id: string; title: string; description: string; priority: string; status: string;
  createdAt: string; scheduledDate: string | null; cost: number | null; vendorName: string | null;
  unit: { id: string; unitLabel: string }; tenant: { name: string } | null
}
interface UnitOption { id: string; unitLabel: string }

interface Props {
  projectId: string
  requests: Request[]
  units: UnitOption[]
}

export function MaintenanceBoard({ projectId, requests: initial, units }: Props) {
  const [requests, setRequests] = useState<Request[]>(initial)
  const [showForm, setShowForm] = useState(false)

  const grouped = STATUS_COLUMNS.reduce<Record<string, Request[]>>((acc, status) => {
    acc[status] = requests.filter(r => r.status === status)
    return acc
  }, {} as Record<string, Request[]>)

  function handleCreated(req: unknown) {
    setRequests(prev => [req as Request, ...prev])
    setShowForm(false)
  }

  async function updateStatus(requestId: string, status: MaintStatus) {
    const res = await fetch(`/api/projects/${projectId}/maintenance/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status } : r))
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold">{requests.length} request{requests.length !== 1 ? 's' : ''}</h2>
        <button
          type="button"
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New request
        </button>
      </div>

      {showForm && (
        <div className="mb-4 rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-4">Create maintenance request</h3>
          <MaintenanceForm
            projectId={projectId}
            units={units}
            onCreated={handleCreated}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        {STATUS_COLUMNS.map(status => (
          <div key={status} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {MAINTENANCE_STATUS_LABELS[status] ?? status}
              </span>
              <span className="text-xs text-muted-foreground">{grouped[status].length}</span>
            </div>

            <div className="min-h-16 rounded-lg border border-dashed p-2 flex flex-col gap-2">
              {grouped[status].map(req => (
                <div key={req.id} className="rounded-lg border bg-background p-2 text-xs">
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <p className="font-medium leading-tight">{req.title}</p>
                    <span className={cn('rounded-full px-1.5 py-0.5 text-xs shrink-0', MAINTENANCE_PRIORITY_COLORS[req.priority] ?? 'bg-muted')}>
                      {MAINTENANCE_PRIORITY_LABELS[req.priority]?.[0] ?? req.priority}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{req.unit.unitLabel}</p>
                  {req.tenant && <p className="text-muted-foreground">{req.tenant.name}</p>}

                  {/* Quick status change */}
                  <select
                    value={req.status}
                    onChange={e => updateStatus(req.id, e.target.value as MaintStatus)}
                    className="mt-1 w-full rounded border px-1 py-0.5 text-xs bg-background"
                    onClick={e => e.stopPropagation()}
                  >
                    {STATUS_COLUMNS.map(s => (
                      <option key={s} value={s}>{MAINTENANCE_STATUS_LABELS[s] ?? s}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
