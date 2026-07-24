'use client'

import React, { useEffect, useRef, useState } from 'react'
import type { CategoryGroup } from '@/components/rules/rule-types'
import { PortalDropdown } from '@/components/ui/portal-dropdown'
import { usePortalOutsideClick } from '@/hooks/use-portal-outside-click'

export interface CategorySuggestion {
  id: string
  name: string
  groupName: string
  confidence: number
}

const DEFAULT_INPUT_CLASS =
  'w-full rounded border border-blue-400 bg-white px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-blue-400'

/**
 * Type-ahead category picker shared by the transactions table cell and the
 * rule editor. When `context` is provided, confidence scores are fetched once
 * from /api/llm/suggest-category (transactions cell); omit it for a plain
 * filterable combobox with no LLM call (rule editor).
 */
export function CategoryCombobox({
  value,
  groups,
  context,
  onCommit,
  onCancel,
  autoFocus = false,
  placeholder = 'Type to filter…',
  inputClassName = DEFAULT_INPUT_CLASS,
}: {
  value: string | null
  groups: CategoryGroup[]
  context?: { description: string; payeeName: string | null; amount: number }
  onCommit: (id: string | null) => void
  onCancel?: () => void
  autoFocus?: boolean
  placeholder?: string
  inputClassName?: string
}) {
  const allCats = groups.flatMap((g) => g.categories.map((c) => ({ ...c, groupName: g.name })))
  const current = allCats.find((c) => c.id === value)
  const [query, setQuery] = useState(current?.name ?? '')
  // Only the initially-clicked instance auto-opens; others open on interaction.
  const [open, setOpen] = useState(autoFocus)
  const [activeIdx, setActiveIdx] = useState(0)
  const [suggestions, setSuggestions] = useState<CategorySuggestion[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const fetchedRef = useRef(false)

  // Fetch confidence scores once — only when transaction context is supplied.
  useEffect(() => {
    if (!context || fetchedRef.current) return
    fetchedRef.current = true
    setLoadingSuggestions(true)
    fetch('/api/llm/suggest-category', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: context.description,
        payeeName: context.payeeName,
        amount: context.amount,
        categories: allCats.map((c) => ({ id: c.id, name: c.name, groupName: c.groupName })),
      }),
    })
      .then((r) => r.json())
      .then((j) => { if (!j.error) setSuggestions(j.data?.suggestions ?? []) })
      .catch(() => {})
      .finally(() => setLoadingSuggestions(false))
  // allCats is derived from groups prop — stable for the lifetime of this instance
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Build the display list: if user has typed a query, filter first then sort
  // by confidence. If no query, sort purely by confidence (with unscored last).
  const confidenceMap = new Map(suggestions.map((s) => [s.id, s.confidence]))

  const filtered = (query.trim() === ''
    ? allCats
    : allCats.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.groupName.toLowerCase().includes(query.toLowerCase())
      )
  ).slice().sort((a, b) => {
    const ca = confidenceMap.get(a.id) ?? -1
    const cb = confidenceMap.get(b.id) ?? -1
    return cb - ca
  })

  useEffect(() => { if (autoFocus) { inputRef.current?.focus(); inputRef.current?.select() } }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setActiveIdx(0) }, [query])

  function commit(id: string | null) {
    setOpen(false)
    const picked = allCats.find((c) => c.id === id)
    if (picked) setQuery(picked.name)
    const scrollY = window.scrollY
    onCommit(id)
    requestAnimationFrame(() => { window.scrollTo({ top: scrollY, behavior: 'instant' }) })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); onCancel?.(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation() // don't bubble — picking a category shouldn't submit forms / exit row edit
      if (query.trim() === '' && activeIdx === -1) { commit(null); return }
      const picked = filtered[activeIdx]
      if (picked) commit(picked.id)
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (query === '') { commit(null) }
    }
  }

  // Close on outside click and revert the visible query to the committed value.
  usePortalOutsideClick(anchorRef, () => {
    setOpen(false)
    setQuery(allCats.find((c) => c.id === value)?.name ?? '')
  }, { enabled: open })

  return (
    <div ref={anchorRef} className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onKeyDown={handleKeyDown}
        onFocus={() => setOpen(true)}
        onMouseDown={() => setOpen(true)}
        placeholder={placeholder}
        className={inputClassName}
        aria-label="Select category"
        autoComplete="off"
      />
      <PortalDropdown anchorRef={anchorRef} open={open && filtered.length > 0} widthFromAnchor>
        <ul
          ref={listRef}
          className="rounded border border-black/10 bg-white shadow-lg text-xs max-h-52 overflow-y-auto w-64"
        >
          <li
            onMouseDown={(e) => { e.preventDefault(); commit(null) }}
            className={`px-2 py-1 cursor-pointer text-muted-foreground italic ${activeIdx === -1 ? 'bg-blue-50' : 'hover:bg-muted/40'}`}
          >
            — None —
          </li>
          {filtered.map((cat, i) => {
            const conf = confidenceMap.get(cat.id)
            return (
              <li
                key={cat.id}
                onMouseDown={(e) => { e.preventDefault(); commit(cat.id) }}
                className={`px-2 py-1 cursor-pointer flex items-center gap-1.5 ${i === activeIdx ? 'bg-blue-50' : 'hover:bg-muted/40'}`}
              >
                <span className="flex-1 truncate">{cat.name}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{cat.groupName}</span>
                {conf != null && (
                  <span
                    className={`shrink-0 text-[9px] font-medium px-1 py-0.5 rounded ${
                      conf >= 0.7
                        ? 'bg-green-100 text-green-700'
                        : conf >= 0.4
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {Math.round(conf * 100)}%
                  </span>
                )}
                {loadingSuggestions && conf == null && (
                  <span className="shrink-0 w-6 h-3 bg-muted/40 rounded animate-pulse" />
                )}
              </li>
            )
          })}
        </ul>
      </PortalDropdown>
    </div>
  )
}
