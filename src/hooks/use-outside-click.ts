'use client'

import { useEffect, useRef } from 'react'

export function useOutsideClick(
  ref: React.RefObject<HTMLElement | null>,
  onOutside: () => void,
  opts?: { enabled?: boolean; ignoreSelector?: string },
) {
  const enabled = opts?.enabled ?? true
  const onOutsideRef = useRef(onOutside)

  useEffect(() => {
    onOutsideRef.current = onOutside
  })

  useEffect(() => {
    if (!enabled) return

    function handler(e: MouseEvent) {
      const target = e.target as Element | null
      if (opts?.ignoreSelector && target?.closest(opts.ignoreSelector)) return
      if (ref.current && target && !ref.current.contains(target)) onOutsideRef.current()
    }

    document.addEventListener('mousedown', handler, true)
    return () => document.removeEventListener('mousedown', handler, true)
  }, [ref, enabled, opts?.ignoreSelector])
}
