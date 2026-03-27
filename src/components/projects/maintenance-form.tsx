'use client'

import { useState } from 'react'
import { MAINTENANCE_PRIORITY_LABELS } from '@/types'

interface UnitOption { id: string; unitLabel: string }

interface Props {
  projectId: string
  units: UnitOption[]
  onCreated: (req: unknown) => void
  onCancel: () => void
}

export function MaintenanceForm({ projectId, units, onCreated, onCancel }: Props) {
  const [unitId, setUnitId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('MEDIUM')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!unitId || !title || !description) {
      setError('Please fill in all required fields')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId, title, description, priority }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? 'Failed to create request')
        return
      }
      onCreated(json.data)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Unit <span className="text-destructive">*</span></label>
          <select
            value={unitId}
            onChange={e => setUnitId(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            required
          >
            <option value="">Select unit…</option>
            {units.map(u => <option key={u.id} value={u.id}>{u.unitLabel}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Priority</label>
          <select
            value={priority}
            onChange={e => setPriority(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {Object.entries(MAINTENANCE_PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Title <span className="text-destructive">*</span></label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Leaking faucet in kitchen"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description <span className="text-destructive">*</span></label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          rows={3}
          placeholder="Detailed description of the issue"
          required
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Creating…' : 'Create request'}
        </button>
      </div>
    </form>
  )
}
