'use client'

import React, { useEffect, useRef, useState } from 'react'
import type { Payee } from '@/components/rules/rule-editor'
import { PortalDropdown } from '@/components/ui/portal-dropdown'
import { useOutsideClick } from '@/hooks/use-outside-click'

export function PayeeCell({
  value,
  payees,
  onCommit,
  onCancel,
  onNewPayee,
}: {
  value: string | null
  payees: Payee[]
  onCommit: (id: string | null) => void
  onCancel: () => void
  onNewPayee: (p: Payee) => void
}) {
  const currentName = payees.find((p) => p.id === value)?.name ?? ''
  const [draft, setDraft] = useState(currentName)
  const [open, setOpen] = useState(true)
  const [creating, setCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [])

  const filtered = draft.trim()
    ? payees.filter((p) => p.name.toLowerCase().includes(draft.toLowerCase()))
    : payees

  const exactMatch = payees.some((p) => p.name.toLowerCase() === draft.trim().toLowerCase())
  const showCreate = draft.trim().length > 0 && !exactMatch

  async function createAndCommit() {
    const name = draft.trim()
    if (!name || creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/payees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) { setCreating(false); return }
      const json = await res.json()
      const newPayee: Payee = { id: json.data.id, name: json.data.name }
      setOpen(false)
      setDraft(newPayee.name)
      // onNewPayee adds to state AND commits the transaction in one shot,
      // so we skip the separate onCommit call to avoid a double-patch.
      onNewPayee(newPayee)
    } catch {
      setCreating(false)
    }
  }

  function pickExisting(p: Payee) {
    setOpen(false)
    setDraft(p.name)
    onCommit(p.id)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onCancel(); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation() // don't bubble to row — selecting a payee shouldn't also exit row edit
      const exact = payees.find((p) => p.name.toLowerCase() === draft.trim().toLowerCase())
      if (exact) { onCommit(exact.id); return }
      if (filtered.length === 1) { onCommit(filtered[0].id); return }
      if (showCreate) createAndCommit()
    }
  }

  // Close dropdown on outside click — just commit best match; row-level
  // outside-click handler owns the actual "exit row" logic.
  useOutsideClick(wrapRef, () => {
    setOpen(false)
    const exact = payees.find((p) => p.name.toLowerCase() === draft.trim().toLowerCase())
    if (exact) onCommit(exact.id)
    else if (draft.trim() === '') onCommit(null)
    // If no match, leave as-is — don't call onCancel (that would exit row edit)
  }, { enabled: open })

  return (
    <div ref={wrapRef} className="relative w-full min-w-[140px]">
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setOpen(true) }}
        onKeyDown={handleKeyDown}
        placeholder="Type to search or create…"
        disabled={creating}
        className="w-full rounded border border-blue-400 bg-white px-1 py-0 text-sm outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-60"
        aria-label="Select or create payee"
        autoComplete="off"
      />
      <PortalDropdown anchorRef={wrapRef} open={open && (filtered.length > 0 || showCreate)} widthFromAnchor>
        <ul
          ref={listRef}
          className="rounded border border-black/10 bg-white shadow-md text-[10px] max-h-44 overflow-y-auto"
        >
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
