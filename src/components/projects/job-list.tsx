'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Plus, MoreHorizontal } from 'lucide-react'
import { JOB_STATUS_LABELS } from '@/types'
import { cn } from '@/lib/utils'

interface Job {
  id: string; name: string; description: string | null; status: string;
  budgetAmount: number | null; startDate: string | null; endDate: string | null;
}

interface Props {
  projectId: string
  projectSlug: string
  jobs: Job[]
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  ACTIVE: 'bg-green-100 text-green-800',
  ON_HOLD: 'bg-amber-100 text-amber-800',
  COMPLETED: 'bg-blue-100 text-blue-800',
  CANCELLED: 'bg-red-100 text-red-800',
}

function ThreeDotMenu({ onEdit, onDelete, estimatesHref }: { onEdit: () => void; onDelete: () => void; estimatesHref: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    setTimeout(() => document.addEventListener('click', handleClick), 0)
    return () => document.removeEventListener('click', handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="rounded p-1 hover:bg-muted transition-colors"
        aria-label="Actions"
      >
        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-36 rounded-md border bg-popover shadow-md">
          <Link
            href={estimatesHref}
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-left text-sm hover:bg-muted transition-colors rounded-t-md"
          >
            Estimates
          </Link>
          <button
            type="button"
            onClick={() => { setOpen(false); onEdit() }}
            className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); onDelete() }}
            className="w-full px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10 transition-colors rounded-b-md"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

export function JobList({ projectId, projectSlug, jobs: initial }: Props) {
  const [jobs, setJobs] = useState<Job[]>(initial)
  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editBudget, setEditBudget] = useState('')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

  function startEdit(job: Job) {
    setEditingId(job.id)
    setEditName(job.name)
    setEditDescription(job.description ?? '')
    setEditBudget(job.budgetAmount !== null ? String(job.budgetAmount) : '')
    setEditStartDate(job.startDate ? job.startDate.slice(0, 10) : '')
    setEditEndDate(job.endDate ? job.endDate.slice(0, 10) : '')
  }

  function cancelEdit() {
    setEditingId(null)
    setError(null)
  }

  async function handleSaveEdit(jobId: string) {
    if (!editName.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription || undefined,
          budgetAmount: editBudget ? Number(editBudget) : undefined,
          startDate: editStartDate || undefined,
          endDate: editEndDate || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? 'Failed to save')
        return
      }
      setJobs(prev => prev.map(j => j.id === jobId ? {
        ...j,
        name: editName.trim(),
        description: editDescription || null,
        budgetAmount: editBudget ? Number(editBudget) : null,
        startDate: editStartDate || null,
        endDate: editEndDate || null,
      } : j))
      setEditingId(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(jobId: string) {
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/jobs/${jobId}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json()
        setError(json.error ?? 'Failed to delete')
        return
      }
      setJobs(prev => prev.filter(j => j.id !== jobId))
      setConfirmDeleteId(null)
    } finally {
      setDeleting(false)
    }
  }

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
        <div className="rounded-lg border overflow-visible">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Budget</th>
                <th className="text-left px-4 py-2 font-medium">Dates</th>
                <th className="px-4 py-2 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {jobs.map(job => {
                if (confirmDeleteId === job.id) {
                  return (
                    <tr key={job.id} className="bg-destructive/5">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-destructive font-medium">Delete &ldquo;{job.name}&rdquo;? This cannot be undone.</span>
                          <button
                            type="button"
                            onClick={() => handleDelete(job.id)}
                            disabled={deleting}
                            className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors"
                          >
                            {deleting ? 'Deleting…' : 'Confirm delete'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }

                if (editingId === job.id) {
                  return (
                    <tr key={job.id} className="bg-muted/20">
                      <td className="px-4 py-2" colSpan={5}>
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={editName}
                              onChange={e => setEditName(e.target.value)}
                              className="flex-1 rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              placeholder="Job name"
                              autoFocus
                            />
                            <input
                              type="number"
                              value={editBudget}
                              onChange={e => setEditBudget(e.target.value)}
                              className="w-32 rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              placeholder="Budget"
                              min={0}
                              step={0.01}
                            />
                          </div>
                          <input
                            type="text"
                            value={editDescription}
                            onChange={e => setEditDescription(e.target.value)}
                            className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Description (optional)"
                          />
                          <div className="flex gap-2">
                            <input
                              type="date"
                              value={editStartDate}
                              onChange={e => setEditStartDate(e.target.value)}
                              className="rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            <span className="self-center text-muted-foreground text-xs">to</span>
                            <input
                              type="date"
                              value={editEndDate}
                              onChange={e => setEditEndDate(e.target.value)}
                              className="rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(job.id)}
                              disabled={saving || !editName.trim()}
                              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                            >
                              {saving ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={job.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2">
                      <Link
                        href={`/projects/${projectSlug}/jobs/${job.id}/estimates/new`}
                        className="font-medium hover:underline"
                      >
                        {job.name}
                      </Link>
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
                    <td className="px-4 py-2">
                      <ThreeDotMenu
                        estimatesHref={`/projects/${projectSlug}/jobs/${job.id}/estimates/new`}
                        onEdit={() => startEdit(job)}
                        onDelete={() => setConfirmDeleteId(job.id)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
