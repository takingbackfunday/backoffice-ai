'use client'

import React, { useEffect, useRef, useState } from 'react'
import type { Payee } from '@/components/rules/rule-types'
import { PortalDropdown } from '@/components/ui/portal-dropdown'
import { usePortalOutsideClick } from '@/hooks/use-portal-outside-click'

/** Handle the combobox registers so a parent can inspect/revert an uncommitted
 * payee draft (see use-payee-create-prompt on the transactions page). */
export interface PayeeDraftHandle {
  /** Trimmed draft when it doesn't exactly match an existing payee, else null. */
  getUnmatched: () => string | null
  /** Reverts the draft back to the committed payee name. */
  reset: () => void
}

const DEFAULT_INPUT_CLASS =
  'w-full rounded border border-blue-400 bg-white px-1 py-0 text-sm outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-60'

/**
 * Payee picker with explicit creation. A new Payee row is created ONLY when the
 * user clicks (or Enter-selects) the `+ Create "X"` row, which is shown only
 * when the draft has no exact case-insensitive match. Creation goes through
 * POST /api/payees; a 409 (case-variant exists) self-heals by selecting the
 * existing payee.
 */
export function PayeeCombobox({
  value,
  payees,
  onCommit,
  onCancel,
  onPayeeCreated,
  onDraftChange,
  autoFocus = false,
  unmatchedDraftRef,
  initialQuery,
  placeholder = 'Type to search or create…',
  inputClassName = DEFAULT_INPUT_CLASS,
  listClassName = 'rounded border border-black/10 bg-white shadow-md text-[10px] max-h-44 overflow-y-auto',
}: {
  value: string | null
  payees: Payee[]
  /** Commit an existing (or just-created) payee id; `freshPayee` is passed for newly created payees not yet in parent state. */
  onCommit: (id: string | null, freshPayee?: Payee) => void
  onCancel?: () => void
  /** Called after a payee is created so the parent can append it to its list. */
  onPayeeCreated?: (p: Payee) => void
  /** Mirrors the raw draft upward (used by the rule editor to keep unmatched names). */
  onDraftChange?: (draft: string) => void
  autoFocus?: boolean
  unmatchedDraftRef?: React.RefObject<PayeeDraftHandle | null>
  /** Seed the draft when there is no committed payee (e.g. an unmatched suggested name). */
  initialQuery?: string
  placeholder?: string
  inputClassName?: string
  listClassName?: string
}) {
  const currentName = payees.find((p) => p.id === value)?.name ?? ''
  const [draft, setDraft] = useState(currentName || (initialQuery ?? ''))
  // Only the initially-clicked instance auto-opens; reopen on interaction below.
  const [open, setOpen] = useState(autoFocus)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (autoFocus) { inputRef.current?.focus(); inputRef.current?.select() } }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Register the draft handle so an unmatched draft is never discarded silently.
  useEffect(() => {
    if (!unmatchedDraftRef) return
    const ref = unmatchedDraftRef
    ref.current = {
      getUnmatched: () => {
        const d = draft.trim()
        if (!d) return null
        const exact = payees.some((p) => p.name.toLowerCase() === d.toLowerCase())
        return exact ? null : d
      },
      reset: () => setDraft(currentName),
    }
    return () => { ref.current = null }
  }, [draft, payees, currentName, unmatchedDraftRef])

  const filtered = draft.trim()
    ? payees.filter((p) => p.name.toLowerCase().includes(draft.toLowerCase()))
    : payees

  const exactMatch = payees.some((p) => p.name.toLowerCase() === draft.trim().toLowerCase())
  const showCreate = draft.trim().length > 0 && !exactMatch

  async function createAndCommit() {
    const name = draft.trim()
    if (!name || creating) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/payees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const json = await res.json().catch(() => null)
      // 409 — a case-variant already exists server-side: select it instead of duplicating.
      if (res.status === 409 && json?.data?.id) {
        const existing: Payee = { id: json.data.id, name: json.data.name }
        setOpen(false)
        setDraft(existing.name)
        onPayeeCreated?.(existing)
        onCommit(existing.id, existing)
        setCreating(false)
        return
      }
      if (!res.ok || !json?.data?.id) {
        setError(json?.error ?? 'Failed to create payee')
        setCreating(false)
        return
      }
      const newPayee: Payee = { id: json.data.id, name: json.data.name }
      setOpen(false)
      setDraft(newPayee.name)
      onPayeeCreated?.(newPayee)
      onCommit(newPayee.id, newPayee)
      setCreating(false)
    } catch {
      setError('Failed to create payee')
      setCreating(false)
    }
  }

  function pickExisting(p: Payee) {
    setOpen(false)
    setDraft(p.name)
    setError(null)
    onCommit(p.id)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); onCancel?.(); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation() // don't bubble — picking a payee shouldn't submit forms / exit row edit
      const exact = payees.find((p) => p.name.toLowerCase() === draft.trim().toLowerCase())
      if (exact) { pickExisting(exact); return }
      if (filtered.length === 1) { pickExisting(filtered[0]); return }
      if (showCreate) createAndCommit()
    }
  }

  // Close dropdown on outside click — just commit best match; the transactions
  // row-level outside-click handler owns the actual "exit row" logic, and its
  // exit guard prompts for unmatched drafts instead of dropping them.
  usePortalOutsideClick(wrapRef, () => {
    setOpen(false)
    const exact = payees.find((p) => p.name.toLowerCase() === draft.trim().toLowerCase())
    if (exact) onCommit(exact.id)
    else if (draft.trim() === '') onCommit(null)
  }, { enabled: open })

  return (
    <div ref={wrapRef} className="relative w-full min-w-[140px]">
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => { setDraft(e.target.value); onDraftChange?.(e.target.value); setOpen(true); setError(null) }}
        onKeyDown={handleKeyDown}
        onMouseDown={() => setOpen(true)}
        placeholder={placeholder}
        disabled={creating}
        className={inputClassName}
        aria-label="Select or create payee"
        autoComplete="off"
      />
      {error && (
        <p role="alert" className="absolute left-0 top-full mt-0.5 z-10 whitespace-nowrap rounded bg-red-50 px-1 py-0.5 text-[10px] text-red-600 shadow-sm">
          {error}
        </p>
      )}
      <PortalDropdown anchorRef={wrapRef} open={open && (filtered.length > 0 || showCreate)} widthFromAnchor>
        <ul ref={listRef} className={listClassName}>
          {filtered.map((p) => (
            <li
              key={p.id}
              onMouseDown={(e) => { e.preventDefault(); pickExisting(p) }}
              className="px-2 py-1 cursor-pointer hover:bg-blue-50"
            >
              {p.name}
            </li>
          ))}
          {showCreate && (
            <li
              onMouseDown={(e) => { e.preventDefault(); createAndCommit() }}
              className="px-2 py-1 cursor-pointer hover:bg-green-50 text-green-700 font-medium border-t border-black/5"
            >
              {creating ? 'Creating…' : `+ Create "${draft.trim()}"`}
            </li>
          )}
        </ul>
      </PortalDropdown>
    </div>
  )
}
