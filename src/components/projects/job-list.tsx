'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { JOB_STATUS_LABELS } from '@/types'
import { cn } from '@/lib/utils'

interface Job {
  id: string; name: string; description: string | null; status: string;
  budgetAmount: number | null; startDate: string | null; endDate: string | null;
}

interface Props {
  projectId: string
  jobs: Job[]
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  ACTIVE: 'bg-green-100 text-green-800',
  ON_HOLD: 'bg-amber-100 text-amber-800',
  COMPLETED: 'bg-blue-100 text-blue-800',
  CANCELLED: 'bg-red-100 text-red-800',
}

export function JobList({ projectId, jobs: initial }: Props) {
  const [jobs, setJobs] = useState<Job[]>(initial)
  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    setError(null)

    try {
      const res = await fetch(`/api/projects/${projectId}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, description: newDescription }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? 'Failed to create job')
        return
      }
      setJobs(prev => [json.data, ...prev])
      setNewName('')
      setNewDescription('')
      setShowForm(false)
    } finally {
      setAdding(false)
    }
  }

  async function updateStatus(jobId: string, status: string) {
    const res = await fetch(`/api/projects/${projectId}/jobs/${jobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status } : j))
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</h2>
        <button
          type="button"
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New job
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleAdd} className="mb-4 rounded-lg border p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Job name <span className="text-destructive">*</span></label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Website redesign"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              rows={2}
              placeholder="Optional description"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={adding || !newName.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {adding ? 'Creating…' : 'Create job'}
            </button>
          </div>
        </form>
      )}

      {jobs.length === 0 && !showForm ? (
        <p className="text-sm text-muted-foreground">No jobs yet. Create a job to track work scopes.</p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Budget</th>
                <th className="text-left px-4 py-2 font-medium">Dates</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {jobs.map(job => (
                <tr key={job.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2">
                    <p className="font-medium">{job.name}</p>
                    {job.description && (
                      <p className="text-xs text-muted-foreground">{job.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={job.status}
                      onChange={e => updateStatus(job.id, e.target.value)}
                      className={cn('rounded-full px-2 py-0.5 text-xs font-medium border-0 cursor-pointer focus:outline-none', STATUS_COLORS[job.status] ?? 'bg-muted text-muted-foreground')}
                    >
                      {Object.entries(JOB_STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {job.budgetAmount !== null ? fmt(Number(job.budgetAmount)) : '—'}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground text-xs">
                    {job.startDate ? new Date(job.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                    {job.startDate && job.endDate ? ' — ' : ''}
                    {job.endDate ? new Date(job.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                    {!job.startDate && !job.endDate ? '—' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
