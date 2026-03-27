'use client'

import { useState } from 'react'
import { Plus, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'

const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY'] as const
const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', EMERGENCY: 'Emergency',
}
const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-amber-100 text-amber-700',
  EMERGENCY: 'bg-red-100 text-red-700',
}
const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open', SCHEDULED: 'Scheduled', IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed', CANCELLED: 'Cancelled',
}
const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700',
  SCHEDULED: 'bg-purple-100 text-purple-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-600',
}

interface MaintenanceRequest {
  id: string
  title: string
  description: string | null
  priority: string
  status: string
  createdAt: string
  unit: { id: string; unitLabel: string }
}

interface Props {
  tenantId: string
  unitId: string | null
  projectId?: string | null
  requests: MaintenanceRequest[]
}

export function PortalMaintenanceClient({ tenantId: _tenantId, unitId, projectId: _projectId, requests: initial }: Props) {
  const [requests, setRequests] = useState<MaintenanceRequest[]>(initial)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<typeof PRIORITY_OPTIONS[number]>('MEDIUM')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!unitId) return
    if (!title.trim()) { setError('Title is required'); return }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId, title: title.trim(), description: description.trim() || null, priority }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? 'Failed to submit request'); return }
      setRequests(prev => [json.data, ...prev])
      setTitle('')
      setDescription('')
      setPriority('MEDIUM')
      setShowForm(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      {unitId ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New request
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          You need an active lease to submit maintenance requests.
        </div>
      )}

      {showForm && (
        <div className="rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-4">Submit maintenance request</h3>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-medium">Title *</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Leaking faucet in kitchen"
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium">Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe the issue in detail…"
                rows={3}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as typeof PRIORITY_OPTIONS[number])}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {PRIORITY_OPTIONS.map(p => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Submitting…' : 'Submit request'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setError(null) }}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Wrench className="h-10 w-10 mb-3 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No maintenance requests yet.</p>
          {unitId && (
            <p className="text-xs text-muted-foreground mt-1">Use the button above to submit a request.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map(req => (
            <div key={req.id} className="rounded-lg border px-4 py-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{req.title}</p>
                  {req.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{req.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(req.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[req.status] ?? 'bg-muted')}>
                    {STATUS_LABELS[req.status] ?? req.status}
                  </span>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', PRIORITY_COLORS[req.priority] ?? 'bg-muted')}>
                    {PRIORITY_LABELS[req.priority] ?? req.priority}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
