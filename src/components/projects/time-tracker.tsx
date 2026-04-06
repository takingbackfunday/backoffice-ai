'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Clock, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TimeEntry {
  id: string
  date: string
  minutes: number
  description: string
  billable: boolean
  rate: number | null
  job: { id: string; name: string } | null
}

interface Job {
  id: string
  name: string
}

interface Props {
  projectId: string
  entries: TimeEntry[]
  jobs: Job[]
  defaultRate: number | null
  currency: string
}

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function entryValue(entry: TimeEntry, fallbackRate: number | null): number {
  const rate = entry.rate ?? fallbackRate
  if (!rate || !entry.billable) return 0
  return (entry.minutes / 60) * rate
}

const emptyForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  hours: '',
  minutes: '',
  description: '',
  billable: true,
  rate: '',
  jobId: '',
})

export function TimeTracker({ projectId, entries: initial, jobs, defaultRate, currency }: Props) {
  const router = useRouter()
  const [entries, setEntries] = useState(initial)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filterJobId, setFilterJobId] = useState<string>('all')

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

  const filtered = filterJobId === 'all' ? entries : entries.filter(e => e.job?.id === filterJobId)
  const totalMinutes = filtered.reduce((sum, e) => sum + e.minutes, 0)
  const billableMinutes = filtered.filter(e => e.billable).reduce((sum, e) => sum + e.minutes, 0)
  const totalValue = filtered.reduce((sum, e) => sum + entryValue(e, defaultRate), 0)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const totalMins = (parseInt(form.hours || '0') * 60) + parseInt(form.minutes || '0')
    if (!form.description.trim()) { setError('Description is required'); return }
    if (totalMins < 1) { setError('Enter at least 1 minute'); return }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: form.date,
          minutes: totalMins,
          description: form.description.trim(),
          billable: form.billable,
          rate: form.rate ? parseFloat(form.rate) : null,
          jobId: form.jobId || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to save'); return }
      setEntries(prev => [json.data, ...prev])
      setForm(emptyForm())
      setShowForm(false)
      router.refresh()
    } catch {
      setError('Failed to save time entry')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await fetch(`/api/projects/${projectId}/time/${id}`, { method: 'DELETE' })
      setEntries(prev => prev.filter(e => e.id !== id))
      router.refresh()
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-6 text-sm border rounded-lg px-4 py-3 bg-muted/20">
        <div>
          <span className="text-muted-foreground">Total </span>
          <span className="font-medium">{fmtDuration(totalMinutes)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Billable </span>
          <span className="font-medium">{fmtDuration(billableMinutes)}</span>
        </div>
        {totalValue > 0 && (
          <div>
            <span className="text-muted-foreground">Value </span>
            <span className="font-medium">{fmt(totalValue)}</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-3">
          {jobs.length > 0 && (
            <select
              value={filterJobId}
              onChange={e => setFilterJobId(e.target.value)}
              className="text-xs border rounded px-2 py-1 bg-background"
            >
              <option value="all">All jobs</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
            </select>
          )}
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded border hover:bg-accent"
          >
            <Plus className="w-3 h-3" /> Log time
          </button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleAdd} className="border rounded-lg p-4 space-y-3 bg-muted/10">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border rounded px-2 py-1.5 text-sm bg-background"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Duration</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={form.hours}
                  onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
                  placeholder="0h"
                  min="0"
                  className="w-full border rounded px-2 py-1.5 text-sm bg-background"
                />
                <span className="text-muted-foreground text-sm">h</span>
                <input
                  type="number"
                  value={form.minutes}
                  onChange={e => setForm(f => ({ ...f, minutes: e.target.value }))}
                  placeholder="0m"
                  min="0"
                  max="59"
                  className="w-full border rounded px-2 py-1.5 text-sm bg-background"
                />
                <span className="text-muted-foreground text-sm">m</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="What did you work on?"
              className="w-full border rounded px-2 py-1.5 text-sm bg-background"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {jobs.length > 0 && (
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Job <span className="font-normal">(optional)</span></label>
                <select
                  value={form.jobId}
                  onChange={e => setForm(f => ({ ...f, jobId: e.target.value }))}
                  className="w-full border rounded px-2 py-1.5 text-sm bg-background"
                >
                  <option value="">— none —</option>
                  {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Rate override <span className="font-normal">(optional)</span></label>
              <input
                type="number"
                value={form.rate}
                onChange={e => setForm(f => ({ ...f, rate: e.target.value }))}
                placeholder={defaultRate ? `${defaultRate} (default)` : 'per hr'}
                min="0"
                step="0.01"
                className="w-full border rounded px-2 py-1.5 text-sm bg-background"
              />
            </div>
            <div className="flex items-end pb-1.5">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.billable}
                  onChange={e => setForm(f => ({ ...f, billable: e.target.checked }))}
                  className="rounded"
                />
                Billable
              </label>
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(null); setForm(emptyForm()) }}
              className="px-3 py-1.5 rounded border text-xs hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Entries list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-lg">
          <Clock className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No time logged yet</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-xs">Date</th>
                <th className="text-left px-4 py-2 font-medium text-xs">Description</th>
                {jobs.length > 0 && <th className="text-left px-4 py-2 font-medium text-xs">Job</th>}
                <th className="text-right px-4 py-2 font-medium text-xs">Duration</th>
                <th className="text-right px-4 py-2 font-medium text-xs">Billable</th>
                <th className="text-right px-4 py-2 font-medium text-xs">Value</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(entry => {
                const value = entryValue(entry, defaultRate)
                return (
                  <tr key={entry.id} className="hover:bg-muted/20 group">
                    <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(entry.date)}</td>
                    <td className="px-4 py-2">{entry.description}</td>
                    {jobs.length > 0 && (
                      <td className="px-4 py-2 text-xs text-muted-foreground">{entry.job?.name ?? '—'}</td>
                    )}
                    <td className="px-4 py-2 text-right tabular-nums">{fmtDuration(entry.minutes)}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={cn('text-xs px-1.5 py-0.5 rounded-full', entry.billable ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                        {entry.billable ? 'yes' : 'no'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-xs tabular-nums text-muted-foreground">
                      {value > 0 ? fmt(value) : '—'}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        onClick={() => handleDelete(entry.id)}
                        disabled={deleting === entry.id}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      >
                        {deleting === entry.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
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
