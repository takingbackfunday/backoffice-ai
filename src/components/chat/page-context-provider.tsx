'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { findCapability } from '@/lib/agent/site-capabilities-loader'
import { usePageContextStore } from '@/stores/page-context-store'
import type { PageContext } from '@/lib/agent/page-context'

type PartialContext = Omit<PageContext, 'pathname' | 'routeTemplate'>

const SNAPSHOT_DEBOUNCE_MS = 300

export function usePageContext(partial: PartialContext) {
  const pathname = usePathname()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<PartialContext | null>(null)

  // Immediate set for non-snapshot changes (entity switches, navigation)
  useEffect(() => {
    const cap = findCapability(pathname)
    usePageContextStore.getState().setContext({
      pathname,
      routeTemplate: cap?.route ?? null,
      ...partial,
    })
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      usePageContextStore.getState().setContext(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, partial.entityType, partial.entityId, partial.entityName])

  // Debounced snapshot updates — the agent only reads snapshots on message send,
  // so per-keystroke freshness is unnecessary
  useEffect(() => {
    pendingRef.current = partial
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const cap = findCapability(pathname)
      usePageContextStore.getState().setContext({
        pathname,
        routeTemplate: cap?.route ?? null,
        ...pendingRef.current,
      })
    }, SNAPSHOT_DEBOUNCE_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partial])
}
