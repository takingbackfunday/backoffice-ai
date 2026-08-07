'use client'

import { useState } from 'react'
import { Save, Loader2, X } from 'lucide-react'
import type { SectionInput } from './hooks/use-quote-form'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  sections: SectionInput[]
}

export function SaveTemplateModal({ open, onOpenChange, sections }: Props) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  if (!open) return null

  async function handleSave() {
    if (!name.trim()) { setError('Template name is required'); return }

    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: name.trim(),
        sections: sections.map((s, si) => ({
          name: s.name,
          sortOrder: si,
          items: s.items
            .filter(i => i.description.trim())
            .map(i => ({
              description: i.description,
              unit: i.unit || null,
              quantity: parseFloat(i.quantity) || 1,
              rate: i.unitPrice ? parseFloat(i.unitPrice) || null : null,
              costRate: i.costRate ? parseFloat(i.costRate) || null : null,
              tags: i.tags.split(',').map(t => t.trim()).filter(Boolean),
              isOptional: i.isOptional,
            })),
        })),
      }

      const res = await fetch('/api/quote-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to save template'); return }

      setToast({ message: 'Template saved!', type: 'success' })
      setName('')
      setTimeout(() => {
        setToast(null)
        onOpenChange(false)
      }, 1200)
    } catch {
      setError('Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={() => { if (!saving) onOpenChange(false) }}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="relative w-full max-w-md rounded-xl border bg-background shadow-xl p-6"
          onClick={e => e.stopPropagation()}
        >
          {/* Close */}
          <button
            type="button"
            onClick={() => { if (!saving) onOpenChange(false) }}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>

          <h3 className="text-base font-semibold mb-4">Save as Template</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Template name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Website Redesign"
                className="w-full rounded-lg border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                autoFocus
              />
            </div>

            <p className="text-xs text-muted-foreground">
              {sections.flatMap(s => s.items).filter(i => i.description.trim()).length} line items will be saved
              from {sections.length} section{sections.length !== 1 ? 's' : ''}.
            </p>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? 'Saving…' : 'Save Template'}
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={saving}
                className="px-4 py-2 rounded-lg border text-sm hover:bg-accent disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[60] flex items-center gap-2 rounded-lg shadow-lg px-4 py-2.5 text-sm font-medium animate-in slide-in-from-bottom-4 fade-in duration-200 ${
          toast.type === 'success' ? 'bg-zinc-900 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? (
            <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          ) : null}
          {toast.message}
        </div>
      )}
    </>
  )
}
