'use client'

import { useState, useEffect, useCallback } from 'react'
import { Trash2, Loader2, Plus } from 'lucide-react'
import { StarterTemplates } from '@/components/projects/starter-templates'

interface QuoteTemplate {
  id: string
  name: string
  sections: { name: string; items: unknown[] }[]
  usageCount: number
}

export function QuoteTemplatesEditor() {
  const [templates, setTemplates] = useState<QuoteTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showStarter, setShowStarter] = useState(false)

  const refetch = useCallback(() => {
    fetch('/api/quote-templates')
      .then(r => r.json())
      .then(j => { if (j.data) setTemplates(j.data) })
      .catch(() => setError('Failed to load templates'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { refetch() }, [refetch])

  async function handleDelete(id: string) {
    setDeleting(id)
    setError(null)
    try {
      const res = await fetch(`/api/quote-templates/${id}`, { method: 'DELETE' })
      if (!res.ok) { const j = await res.json(); setError(j.error ?? 'Failed to delete'); return }
      setTemplates(prev => prev.filter(t => t.id !== id))
    } catch {
      setError('Failed to delete')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div id="quote-templates" className="rounded-lg border bg-white">
      <div className="px-4 py-2.5 border-b bg-muted/30 rounded-t-lg">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-800">Quote Templates</p>
      </div>

      <div className="px-4 py-3 space-y-3">
        {error && (
          <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">{error}</p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length > 0 ? (
          <>
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {templates.map(t => {
                const sectionCount = t.sections?.length ?? 0
                const itemCount = t.sections?.reduce((sum, s) => sum + (s.items?.length ?? 0), 0) ?? 0
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-muted/30 group"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {sectionCount} section{sectionCount !== 1 ? 's' : ''} · {itemCount} item{itemCount !== 1 ? 's' : ''} · used {t.usageCount}×
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(t.id)}
                      disabled={deleting === t.id}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity disabled:opacity-50"
                    >
                      {deleting === t.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />
                      }
                    </button>
                  </div>
                )
              })}
            </div>

            {showStarter ? (
              <div className="pt-2 border-t">
                <StarterTemplates onCreated={() => { refetch(); setShowStarter(false) }} />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowStarter(true)}
                className="flex items-center gap-1 text-xs text-primary hover:underline pt-2 border-t w-full"
              >
                <Plus className="w-3 h-3" /> Add starter templates
              </button>
            )}
          </>
        ) : (
          <StarterTemplates onCreated={() => refetch()} />
        )}
      </div>
    </div>
  )
}
