'use client'

import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

interface PortalDropdownProps {
  anchorRef: RefObject<HTMLElement | null>
  open: boolean
  children: ReactNode
  align?: 'left' | 'right'
  widthFromAnchor?: boolean
  className?: string
}

export function useAnchorRect(anchorRef: RefObject<HTMLElement | null>, open: boolean) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!open) { setRect(null); return }
    function update() {
      if (anchorRef.current) setRect(anchorRef.current.getBoundingClientRect())
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, anchorRef])
  return rect
}

export function PortalDropdown({
  anchorRef,
  open,
  children,
  align = 'left',
  widthFromAnchor = false,
  className,
}: PortalDropdownProps) {
  const rect = useAnchorRect(anchorRef, open)

  if (!open || !rect || typeof window === 'undefined') return null

  const style: React.CSSProperties = {
    position: 'fixed',
    top: rect.bottom + 4,
    left: align === 'right' ? undefined : rect.left,
    right: align === 'right' ? undefined : undefined,
    ...(widthFromAnchor ? { width: rect.width } : {}),
    zIndex: 50,
  }

  if (align === 'right') {
    style.right = window.innerWidth - rect.right
  }

  return createPortal(
    <div
      data-portal-dropdown=""
      className={className}
      style={style}
    >
      {children}
    </div>,
    document.body,
  )
}
