'use client'

import { useState, useEffect, useRef } from 'react'

export interface MarginRule {
  tag: string
  marginPct: number
}

/**
 * Fetches GET /api/margin-rules once on mount.
 * Returns cached rules or empty array on error.
 */
export function useMarginRules(): MarginRule[] {
  const [rules, setRules] = useState<MarginRule[]>([])
  const fetched = useRef(false)

  useEffect(() => {
    if (fetched.current) return
    fetched.current = true

    fetch('/api/margin-rules')
      .then(res => res.json())
      .then(json => {
        if (json.data) setRules(json.data)
      })
      .catch(() => {
        // silently fail — empty rules is acceptable
      })
  }, [])

  return rules
}
