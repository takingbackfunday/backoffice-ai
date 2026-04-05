'use client'

import { useState } from 'react'
import { Plus, Trash2, Loader2 } from 'lucide-react'

interface MarginRule {
  id: string
  tag: string
  marginPct: number
}

interface Props {
  initialRules: MarginRule[]
}

export function MarginRulesEditor({ initialRules }: Props) {
  const [rules, setRules] = useState<MarginRule[]>(initialRules)
  const [newTag, setNewTag] = useState('')
  const [newPct, setNewPct] = useState('')
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd() {
    if (!newTag.trim() || !newPct) return
    const pct = parseFloat(newPct)
    if (isNaN(pct) || pct < 0) { setError('Margin must be a positive number'); return }

    setAdding(true)
    setError(null)
    try {
      const res = await fetch('/api/margin-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: newTag.toLowerCase().trim(), marginPct: pct }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to add rule'); return }
      setRules(prev => {
        const existing = prev.findIndex(r => r.tag === json.data.tag)
        if (existing >= 0) {
          return prev.map((r, i) => i === existing ? json.data : r)
        }
        return [...prev, json.data]
      })
      setNewTag('')
      setNewPct('')
    } catch {
      setError('Failed to add rule')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    setError(null)
    try {
      const res = await fetch(`/api/margin-rules/${id}`, { method: 'DELETE' })
      if (!res.ok) { setError('Failed to delete rule'); return }
      setRules(prev => prev.filter(r => r.id !== id))
    } catch {
      setError('Failed to delete rule')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Set default margins per work type tag. These are applied automatically when generating quotes from estimates.
      </p>

      {rules.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Tag</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Default Margin</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rules.map(rule => (
                <tr key={rule.id}>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted">
                      {rule.tag}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">{rule.marginPct}%</td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => handleDelete(rule.id)}
                      disabled={deleting === rule.id}
                      className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                    >
                      {deleting === rule.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">No margin rules yet. Add your first one below.</p>
      )}

      {/* Add row */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newTag}
          onChange={e => setNewTag(e.target.value)}
          placeholder="Tag (e.g. dev, design, pm)"
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          className="flex-1 text-sm border rounded px-3 py-1.5 bg-background"
        />
        <input
          type="number"
          value={newPct}
          onChange={e => setNewPct(e.target.value)}
          placeholder="Margin %"
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          className="w-28 text-sm border rounded px-3 py-1.5 bg-background"
          step="1"
          min="0"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newTag.trim() || !newPct}
          className="flex items-center gap-1 text-sm px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Add
        </button>
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{error}</div>
      )}

      <div className="text-xs text-muted-foreground">
        Common tags: <code className="bg-muted px-1 rounded">dev</code>, <code className="bg-muted px-1 rounded">design</code>, <code className="bg-muted px-1 rounded">pm</code>, <code className="bg-muted px-1 rounded">consulting</code>, <code className="bg-muted px-1 rounded">qa</code>
      </div>
    </div>
  )
}
