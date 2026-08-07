'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Loader2 } from 'lucide-react'

interface ServiceItem {
  id: string
  description: string
  unit: string | null
  defaultRate: number
  defaultCostRate: number | null
  tags: string[]
}

export function ServiceItemsEditor() {
  const [items, setItems] = useState<ServiceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [newDescription, setNewDescription] = useState('')
  const [newUnit, setNewUnit] = useState('x')
  const [newRate, setNewRate] = useState('')
  const [newCostRate, setNewCostRate] = useState('')
  const [newTags, setNewTags] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(true)

  useEffect(() => {
    fetch('/api/service-items')
      .then(r => r.json())
      .then(j => { if (j.data) setItems(j.data) })
      .catch(() => setError('Failed to load service items'))
      .finally(() => setLoading(false))
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newDescription.trim() || !newRate) return

    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/service-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: newDescription.trim(),
          unit: newUnit || null,
          defaultRate: parseFloat(newRate),
          defaultCostRate: newCostRate ? parseFloat(newCostRate) : null,
          tags: newTags.split(',').map(t => t.trim()).filter(Boolean),
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to add item'); return }
      setItems(prev => [...prev, json.data])
      setNewDescription('')
      setNewUnit('x')
      setNewRate('')
      setNewCostRate('')
      setNewTags('')
      setCollapsed(true)
    } catch {
      setError('Failed to add item')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    setError(null)
    try {
      const res = await fetch(`/api/service-items/${id}`, { method: 'DELETE' })
      if (!res.ok) { const j = await res.json(); setError(j.error ?? 'Failed to delete'); return }
      setItems(prev => prev.filter(i => i.id !== id))
    } catch {
      setError('Failed to delete')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div id="service-library" className="rounded-lg border bg-white">
      <div className="px-4 py-2.5 border-b bg-muted/30 rounded-t-lg">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-800">Service Library</p>
      </div>

      <div className="px-4 py-3 space-y-3">
        {error && (
          <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">{error}</p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : items.length > 0 ? (
          <div className="space-y-1 max-h-80 overflow-y-auto">
            <div className="grid grid-cols-[1fr_60px_100px_80px_auto] gap-2 px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              <span>Description</span>
              <span>Unit</span>
              <span>Rate</span>
              <span>Cost</span>
              <span />
            </div>
            {items.map(item => (
              <div
                key={item.id}
                className="grid grid-cols-[1fr_60px_100px_80px_auto] gap-2 items-center px-2 py-1.5 rounded hover:bg-muted/30 group"
              >
                <span className="text-sm truncate">{item.description}</span>
                <span className="text-xs text-muted-foreground">{item.unit ?? 'x'}</span>
                <span className="text-xs tabular-nums">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.defaultRate)}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {item.defaultCostRate != null
                    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(item.defaultCostRate)
                    : '—'}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  disabled={deleting === item.id}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity disabled:opacity-50"
                >
                  {deleting === item.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Trash2 className="w-3.5 h-3.5" />
                  }
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">
            No service items yet. Add your first item below.
          </p>
        )}

        {/* Add item form */}
        <form onSubmit={handleAdd} className="space-y-2 pt-2 border-t">
          {collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Plus className="w-3 h-3" /> Add service item
            </button>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_60px_100px_80px_auto] gap-2">
                <input
                  type="text"
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                  placeholder="Description"
                  className="text-xs border rounded px-2 py-1 bg-background w-full"
                  autoFocus
                />
                <input
                  type="text"
                  value={newUnit}
                  onChange={e => setNewUnit(e.target.value)}
                  placeholder="unit"
                  className="text-xs border rounded px-2 py-1 bg-background w-full"
                />
                <input
                  type="number"
                  value={newRate}
                  onChange={e => setNewRate(e.target.value)}
                  placeholder="Rate"
                  step="0.01"
                  className="text-xs border rounded px-2 py-1 bg-background w-full"
                  required
                />
                <input
                  type="number"
                  value={newCostRate}
                  onChange={e => setNewCostRate(e.target.value)}
                  placeholder="Cost"
                  step="0.01"
                  className="text-xs border rounded px-2 py-1 bg-background w-full"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newTags}
                  onChange={e => setNewTags(e.target.value)}
                  placeholder="Tags (comma-separated)"
                  className="flex-1 text-xs border rounded px-2 py-1 bg-background"
                />
                <button
                  type="submit"
                  disabled={saving || !newDescription.trim() || !newRate}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setCollapsed(true)}
                  className="text-xs px-2 py-1.5 rounded border hover:bg-accent"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  )
}
