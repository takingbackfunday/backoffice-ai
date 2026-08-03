'use client'

import Link from 'next/link'
import { confirmLeaveWithChanges } from '@/lib/unsaved-guard'

interface GuardedLinkProps {
  href: string
  dirty: boolean
  children: React.ReactNode
  className?: string
}

/**
 * A `next/link` wrapper that guards against unsaved changes.
 * Modifier-clicks (⌘/Ctrl/Shift/Alt/middle-click) bypass the guard.
 * When `dirty` is true and the user plain-left-clicks, a confirm dialog is shown.
 */
export function GuardedLink({ href, dirty, children, className }: GuardedLinkProps) {
  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        if (!confirmLeaveWithChanges(dirty, window.confirm.bind(window))) {
          e.preventDefault()
        }
      }}
    >
      {children}
    </Link>
  )
}
