'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ResetCategoriesButton() {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)

  async function handleReset() {
    setResetting(true)
    try {
      const res = await fetch('/api/setup/reset-categories', { method: 'POST' })
      const json = await res.json()
      if (!json.error) router.refresh()
    } catch {
      // silently fail — page will just not refresh
    } finally {
      setResetting(false)
      setConfirm(false)
    }
  }

  if (confirm) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-red-600 font-medium">
          This will delete all categories and rules. Continue?
        </span>
        <button
          onClick={handleReset}
          disabled={resetting}
          className="text-xs rounded border border-red-300 bg-red-50 px-2.5 py-1 text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
        >
          {resetting ? 'Resetting…' : 'Yes, reset'}
        </button>
        <button
          onClick={() => setConfirm(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className="text-xs text-muted-foreground hover:text-red-600 transition-colors"
    >
      Reset &amp; choose again
    </button>
  )
}
