'use client'

import React, { useEffect } from 'react'
import { PortalDropdown } from '@/components/ui/portal-dropdown'

/**
 * Inline "Create payee 'X'?" prompt shown when the user tries to exit row
 * edit with a typed payee that matches nothing. Create / Discard are explicit;
 * Escape dismisses the prompt only (row edit continues).
 */
export function PayeeCreatePrompt({
  anchorRef,
  name,
  busy,
  error,
  onCreate,
  onDiscard,
  onDismiss,
}: {
  anchorRef: React.RefObject<HTMLElement | null>
  name: string
  busy: boolean
  error: string | null
  onCreate: () => void
  onDiscard: () => void
  onDismiss: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      // Keep the event from reaching the cell inputs (their Escape exits row edit).
      e.stopPropagation()
      onDismiss()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onDismiss])

  return (
    <PortalDropdown anchorRef={anchorRef} open>
      <div className="w-60 rounded-lg border border-black/10 bg-white p-2.5 shadow-lg whitespace-normal">
        <p className="text-[11px] font-medium text-foreground">
          Create payee <span className="text-[#3C3489]">“{name}”</span>?
        </p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          The name you typed doesn’t match an existing payee.
        </p>
        {error && (
          <p role="alert" className="mt-1 text-[10px] text-red-600">{error}</p>
        )}
        <div className="mt-2 flex items-center gap-1.5">
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onCreate() }}
            disabled={busy}
            className="rounded bg-[#3C3489] px-2.5 py-1 text-[11px] font-medium text-[#EEEDFE] hover:bg-[#2d2770] disabled:opacity-50 transition-colors"
          >
            {busy ? 'Creating…' : 'Create payee'}
          </button>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onDiscard() }}
            disabled={busy}
            className="rounded border border-black/15 px-2.5 py-1 text-[11px] text-[#555] hover:bg-muted disabled:opacity-50 transition-colors"
          >
            Discard
          </button>
        </div>
      </div>
    </PortalDropdown>
  )
}
