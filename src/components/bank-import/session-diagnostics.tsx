'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function SessionDiagnostics({ sessionId }: { sessionId: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function download() {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/bank-import/sessions/${encodeURIComponent(sessionId)}/diagnostics`)
      const json = await response.json()
      if (!response.ok || json.error) throw new Error(json.error ?? 'Diagnostics are unavailable.')
      const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: 'application/json' })
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = `bank-import-${sessionId}.json`
      link.click()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Diagnostics are unavailable.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border-t border-border pt-3">
      <Button variant="ghost" size="sm" disabled={loading} onClick={download}>
        {loading ? 'Preparing diagnostics…' : 'Download diagnostics (JSON)'}
      </Button>
      {error && <p className="mt-1 text-xs text-destructive" role="alert">{error}</p>}
    </div>
  )
}
