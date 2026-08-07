'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { STARTER_TRADES } from '@/lib/starter-templates'

interface Props {
  onCreated: (count: number) => void
}

export function StarterTemplates({ onCreated }: Props) {
  const [trade, setTrade] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const payload =
        trade === 'describe'
          ? { description }
          : { trade }
      const res = await fetch('/api/quote-templates/starter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Failed to create templates')
        return
      }
      setTrade('')
      setDescription('')
      onCreated(json.data.count)
    } catch {
      setError('Failed to create templates')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Get started with ready-made templates — pick your trade, or describe your work and we&rsquo;ll generate them.
      </p>
      <div className="space-y-2">
        <select
          value={trade}
          onChange={e => setTrade(e.target.value)}
          disabled={busy}
          className="w-full border rounded px-3 py-2 text-sm bg-background"
        >
          <option value="">— choose your trade —</option>
          {STARTER_TRADES.map(t => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
          <option value="describe">Something else — describe my work</option>
        </select>

        {trade === 'describe' && (
          <textarea
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !busy && description.trim().length >= 10) {
                e.preventDefault()
                handleSubmit(e)
              }
            }}
            placeholder="e.g. I shoot weddings and edit highlight films…"
            disabled={busy}
            className="w-full border rounded px-3 py-2 text-sm bg-background resize-none"
          />
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy || trade === '' || (trade === 'describe' && description.trim().length < 10)}
          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {trade === 'describe' ? 'Generate my templates' : 'Add starter templates'}
        </button>
      </div>
    </div>
  )
}
