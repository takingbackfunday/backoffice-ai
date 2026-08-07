'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Sparkles, Pencil } from 'lucide-react'
import { WorkProfileSetup } from '@/components/setup/work-profile-setup'

interface Props {
  initialDescription?: string
}

export function WorkProfileEditor({ initialDescription }: Props) {
  const [description, setDescription] = useState(initialDescription ?? '')
  const [editing, setEditing] = useState(!initialDescription)
  const [regenerating, setRegenerating] = useState(false)
  const [templateCount, setTemplateCount] = useState<number | null>(null)
  const [itemCount, setItemCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    try {
      const [tRes, iRes] = await Promise.all([
        fetch('/api/quote-templates'),
        fetch('/api/service-items'),
      ])
      const tJson = await tRes.json()
      const iJson = await iRes.json()
      if (tJson.meta) setTemplateCount(tJson.meta.count)
      if (iJson.meta) setItemCount(iJson.meta.count)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])

  async function handleRegenerate() {
    if (description.trim().length < 10) return
    setRegenerating(true)
    try {
      const res = await fetch('/api/setup/work-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim() }),
      })
      const json = await res.json()
      if (res.ok) {
        await fetchStats()
        setEditing(false)
      }
    } catch {
      // silently fail
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div id="work-profile" className="rounded-lg border bg-white">
      <div className="px-4 py-2.5 border-b bg-muted/30 rounded-t-lg">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-800">Work Profile</p>
      </div>

      <div className="px-4 py-3 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {templateCount != null && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{templateCount} template{templateCount !== 1 ? 's' : ''}</span>
                <span>{itemCount} service item{itemCount !== 1 ? 's' : ''}</span>
              </div>
            )}

            {editing ? (
              <div className="space-y-2">
                {!initialDescription && (
                  <p className="text-xs text-muted-foreground">
                    Describe your work and we&rsquo;ll generate templates and a service-item library.
                  </p>
                )}
                <textarea
                  rows={3}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. I shoot weddings and produce highlight films…"
                  className="w-full border rounded px-3 py-2 text-sm bg-background resize-none"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRegenerate}
                    disabled={regenerating || description.trim().length < 10}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {regenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    Save &amp; regenerate
                  </button>
                  {initialDescription && (
                    <button
                      type="button"
                      onClick={() => { setDescription(initialDescription); setEditing(false) }}
                      className="text-xs px-3 py-1.5 rounded border hover:bg-accent"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {description && (
                  <p className="text-sm text-muted-foreground bg-muted/30 rounded px-3 py-2">
                    &ldquo;{description}&rdquo;
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Pencil className="w-3 h-3" /> Edit description
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
