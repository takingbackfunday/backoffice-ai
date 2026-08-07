'use client'

import { useState, useCallback } from 'react'
import type { ItemInput } from './use-quote-form'

export type LibraryStatus = 'saved' | 'duplicate' | 'error'

export function useSaveToLibrary() {
  const [statuses, setStatuses] = useState<Record<string, LibraryStatus>>({})

  const flash = useCallback((id: string, status: LibraryStatus) => {
    setStatuses(prev => ({ ...prev, [id]: status }))
    setTimeout(() => {
      setStatuses(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }, 2500)
  }, [])

  const save = useCallback(async (item: ItemInput) => {
    const rate = parseFloat(item.unitPrice)
    if (!item.description.trim() || !(rate > 0)) {
      flash(item.id, 'error')
      return
    }
    try {
      const res = await fetch('/api/service-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: item.description.trim(),
          unit: item.unit || null,
          defaultRate: rate,
          defaultCostRate: item.costRate ? parseFloat(item.costRate) || null : null,
          tags: item.tags.split(',').map(t => t.trim()).filter(Boolean),
        }),
      })
      flash(item.id, res.ok ? 'saved' : (res.status === 400 ? 'duplicate' : 'error'))
    } catch {
      flash(item.id, 'error')
    }
  }, [flash])

  return { save, statuses }
}
