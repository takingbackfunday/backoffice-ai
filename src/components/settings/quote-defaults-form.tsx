'use client'

import { useState, useEffect } from 'react'
import { Save, Loader2 } from 'lucide-react'
import { parsePreferences } from '@/types/preferences'

export function QuoteDefaultsForm() {
  const [validityDays, setValidityDays] = useState('30')
  const [terms, setTerms] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    fetch('/api/preferences')
      .then(r => r.json())
      .then(j => {
        if (j.data) {
          const prefs = parsePreferences(j.data.data ?? j.data)
          setValidityDays(String(prefs.quoteValidityDays ?? 30))
          setTerms(prefs.quoteTerms ?? '')
        }
      })
      .catch(() => {})
  }, [])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteValidityDays: parseInt(validityDays, 10) || 30,
          quoteTerms: terms.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to save'); return }
      setToast({ message: 'Quote defaults saved!', type: 'success' })
      setTimeout(() => setToast(null), 3000)
    } catch {
      setError('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div id="quote-defaults" className="rounded-lg border bg-white">
      <div className="px-4 py-2.5 border-b bg-muted/30 rounded-t-lg">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-800">Quote defaults</p>
      </div>
      <div className="px-4 py-3 space-y-3">
        <p className="text-xs text-muted-foreground">
          Default values applied to every new quote. You can override them per-quote in the editor.
        </p>

        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-0.5 uppercase tracking-wide">
            Validity period (days)
          </label>
          <input
            type="number"
            value={validityDays}
            onChange={e => setValidityDays(e.target.value)}
            min="1"
            max="365"
            className="w-24 rounded border px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>

        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-0.5 uppercase tracking-wide">
            Default terms &amp; conditions
          </label>
          <textarea
            value={terms}
            onChange={e => setTerms(e.target.value)}
            placeholder="Payment terms, revision limits, cancellation policy…"
            rows={4}
            className="w-full rounded border px-2 py-1.5 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none"
          />
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg shadow-lg px-4 py-2.5 text-sm font-medium animate-in slide-in-from-bottom-4 fade-in duration-200 ${
          toast.type === 'success' ? 'bg-zinc-900 text-white' : 'bg-red-600 text-white'
        }`}>
          <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          {toast.message}
        </div>
      )}
    </div>
  )
}
