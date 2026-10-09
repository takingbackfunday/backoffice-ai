'use client'

import { useEffect, useState } from 'react'
import { localToday } from '@/lib/bank-import/local-date'

export interface DefaultRangeData {
  from: string
  to: string
  reason: 'since_last' | 'no_history'
  clamped: boolean
  lastTxnDate: string | null
  maxRangeDays: number | null
}

export function useDefaultRange(accountId: string | null): { data: DefaultRangeData | null; loading: boolean; error: string | null } {
  const [result, setResult] = useState<{ accountId: string; data: DefaultRangeData | null; error: string | null }>({ accountId: '', data: null, error: null })

  useEffect(() => {
    if (!accountId) return
    const controller = new AbortController()
    const query = new URLSearchParams({ accountId, today: localToday() })
    void fetch(`/api/bank-import/default-range?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const json = await response.json()
        if (!response.ok || json.error) throw new Error(json.error ?? 'Could not calculate a date range.')
        if (!controller.signal.aborted) setResult({ accountId, data: json.data as DefaultRangeData, error: null })
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setResult({ accountId, data: null, error: cause instanceof Error ? cause.message : 'Could not calculate a date range.' })
      })
    return () => controller.abort()
  }, [accountId])

  const current = accountId && result.accountId === accountId ? result : null
  return { data: current?.data ?? null, loading: !!accountId && !current, error: current?.error ?? null }
}
