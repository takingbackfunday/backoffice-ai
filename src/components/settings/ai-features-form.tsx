'use client'

import { useState } from 'react'

/**
 * "AI features" settings section. Toggles save immediately on change.
 * aiRuleSuggestions is opt-in and defaults OFF for all users (PRD-02 R4).
 */
export function AiFeaturesForm({ initialAiRuleSuggestions = false }: { initialAiRuleSuggestions?: boolean }) {
  const [enabled, setEnabled] = useState(initialAiRuleSuggestions)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle(next: boolean) {
    setEnabled(next) // optimistic
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiRuleSuggestions: next }),
      })
      if (!res.ok) {
        setEnabled(!next) // revert
        setError('Failed to save — try again')
      }
    } catch {
      setEnabled(!next)
      setError('Failed to save — try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div id="ai-features" className="rounded-lg border bg-white mt-4">
      <div className="px-4 py-2.5 border-b bg-muted/30 rounded-t-lg">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-800">AI features</p>
      </div>
      <div className="px-4 py-3">
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            disabled={saving}
            onChange={(e) => toggle(e.target.checked)}
            className="mt-0.5 cursor-pointer disabled:opacity-50"
          />
          <span>
            <span className="block text-xs font-medium">Rule suggestions</span>
            <span className="block text-[11px] text-muted-foreground mt-0.5">
              Suggest categorization rules from my edits and imports. Uses AI; can be turned off anytime.
            </span>
          </span>
        </label>
        {error && <p className="text-[11px] text-red-600 mt-1.5" role="alert">{error}</p>}
      </div>
    </div>
  )
}
