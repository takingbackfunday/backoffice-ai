'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { findCapability } from '@/lib/agent/site-capabilities-loader'
import { usePageContextStore } from '@/stores/page-context-store'
import type { PageContext } from '@/lib/agent/page-context'

type PartialContext = Omit<PageContext, 'pathname' | 'routeTemplate'>

export function usePageContext(partial: PartialContext) {
  const pathname = usePathname()

  useEffect(() => {
    const cap = findCapability(pathname)
    usePageContextStore.getState().setContext({
      pathname,
      routeTemplate: cap?.route ?? null,
      ...partial,
    })
    return () => usePageContextStore.getState().setContext(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, partial.entityType, partial.entityId, partial.entityName])
}
