'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { GitBranch, Loader2 } from 'lucide-react'

interface QuoteRow {
  id: string
  isAmendment: boolean
}

interface Props {
  quote: QuoteRow
  projectSlug: string
}

export function QuoteRowActions({ quote, projectSlug }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (quote.isAmendment) return null

  async function handleDuplicate(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectSlug}/quotes/${quote.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Duplicate failed'); return }
      router.push(`/projects/${projectSlug}/quotes/${json.data.id}/edit`)
    } catch {
      setError('Duplicate failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleDuplicate}
        disabled={loading}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
        title="Duplicate quote"
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <GitBranch className="w-3 h-3" />
        )}
        Duplicate
      </button>
      {error && (
        <span className="text-[10px] text-destructive ml-1">{error}</span>
      )}
    </>
  )
}
