'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import ReactDOM from 'react-dom'
import type { Workspace } from '@/generated/prisma/client'
import type { TransactionWithRelations } from '@/types'
import { RuleEditor, type CategoryGroup, type Payee, type UserRule } from '@/components/rules/rule-editor'
import { RulesAgent } from '@/components/rules/rules-agent'

interface Props {
  initialRows?: TransactionWithRelations[]
  initialTotal?: number
  initialWorkspaces?: Workspace[]
  initialCategoryGroups?: CategoryGroup[]
  initialPayees?: Payee[]
  initialAccounts?: { id: string; name: string }[]
}

type SortField = 'date' | 'amount' | 'description' | 'category'
type SortDir = 'asc' | 'desc'
type EditableField = 'description' | 'category' | 'categoryId' | 'payeeId' | 'notes' | 'projectId' | 'amount' | 'date'

interface ColumnFilters {
  description?: string
  accountName?: string
  amountMin?: string
  amountMax?: string
  payeeName?: string
  notes?: string
  categoryId?: string
  categoryGroupId?: string
  projectId?: string
}

// Returns the bounding rect of an element, refreshed on scroll/resize so
// portal-rendered dropdowns stay anchored even inside scrollable containers.
function useAnchorRect(anchorRef: React.RefObject<HTMLElement | null>, open: boolean) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  useEffect(() => {
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

// ── Inline text input ──────────────────────────────────────────────
function TextCell({
  value,
  onCommit,
  onCancel,
  type = 'text',
  autoFocus = true,
}: {
  value: string
  onCommit: (v: string) => void
  onCancel: () => void
  type?: 'text' | 'number' | 'date'
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (autoFocus) { ref.current?.focus(); ref.current?.select() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <input
      ref={ref}
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); onCommit(draft) } // commit but stay in row
        if (e.key === 'Escape') onCancel()
      }}
      onBlur={() => { if (draft !== value) onCommit(draft) }} // only PATCH if value changed
      className="w-full rounded border border-blue-400 bg-white px-1 py-0 text-sm outline-none focus:ring-1 focus:ring-blue-400"
      aria-label="Edit cell value"
    />
  )
}

// ── Inline project select ──────────────────────────────────────────
function WorkspaceCell({
  value,
  projects,
  onCommit,
  onCancel,
  autoFocus = false,
}: {
  value: string | null
  projects: Workspace[]
  onCommit: (v: string | null) => void
  onCancel: () => void
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLSelectElement>(null)

  useEffect(() => { if (autoFocus) ref.current?.focus() }, [])

  return (
    <select
      ref={ref}
      defaultValue={value ?? ''}
      onChange={(e) => {
        const scrollY = window.scrollY
        onCommit(e.target.value || null)
        requestAnimationFrame(() => { window.scrollTo({ top: scrollY, behavior: 'instant' }) })
      }}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
      className="w-full rounded border border-blue-400 bg-white px-1 py-0 text-sm outline-none focus:ring-1 focus:ring-blue-400"
      aria-label="Select project"
    >
      <option value="">— None —</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  )
}

// ── Inline category combobox (type to filter) ─────────────────────
interface CategorySuggestion {
  id: string
  name: string
  groupName: string
  confidence: number
}

function CategoryCell({
  value,
  groups,
  description,
  payeeName,
  amount,
  onCommit,
  onCancel,
  autoFocus = false,
}: {
  value: string | null
  groups: CategoryGroup[]
  description: string
  payeeName: string | null
  amount: number
  onCommit: (id: string | null) => void
  onCancel: () => void
  autoFocus?: boolean
}) {
  const allCats = groups.flatMap((g) => g.categories.map((c) => ({ ...c, groupName: g.name })))
  const current = allCats.find((c) => c.id === value)
  const [query, setQuery] = useState(current?.name ?? '')
  const [open, setOpen] = useState(true)
  const [activeIdx, setActiveIdx] = useState(0)
  const [suggestions, setSuggestions] = useState<CategorySuggestion[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const fetchedRef = useRef(false)
  const anchorRect = useAnchorRect(anchorRef, open)

  // Fetch confidence scores once on open
  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    setLoadingSuggestions(true)
    fetch('/api/llm/suggest-category', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description,
        payeeName,
        amount,
        categories: allCats.map((c) => ({ id: c.id, name: c.name, groupName: c.groupName })),
      }),
    })
      .then((r) => r.json())
      .then((j) => { if (!j.error) setSuggestions(j.data?.suggestions ?? []) })
      .catch(() => {})
      .finally(() => setLoadingSuggestions(false))
  // allCats is derived from groups prop — stable for the lifetime of this cell
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
    if (e.key === 'Escape') { onCancel(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation() // don't bubble to row — selecting a category shouldn't also exit row edit
      if (query.trim() === '' && activeIdx === -1) { commit(null); return }
      const picked = filtered[activeIdx]
      if (picked) commit(picked.id)
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (query === '') { commit(null) }
    }
  }

  return (
    <div ref={anchorRef} className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setOpen(true)}
        placeholder="Type to filter…"
        className="w-full rounded border border-blue-400 bg-white px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-blue-400"
        aria-label="Select category"
        autoComplete="off"
      />
      {open && filtered.length > 0 && anchorRect && typeof document !== 'undefined' && ReactDOM.createPortal(
        <ul
          ref={listRef}
          data-portal-dropdown
          style={{ position: 'fixed', top: anchorRect.bottom + 2, left: anchorRect.left, width: 256 }}
          className="z-[9999] rounded border border-black/10 bg-white shadow-lg text-xs max-h-52 overflow-y-auto"
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
        </ul>,
        document.body
      )}
    </div>
  )
}

// ── Top-of-page rule prompt banner ────────────────────────────────
const SUGGEST_DELAY_MS = 30000

type RulePromptState = 'watching' | 'analysing' | 'ready' | 'error' | 'idle'

function RulePromptPanel({
  state,
  editCount,
  onAnalyseNow,
  onDismiss,
}: {
  state: RulePromptState
  editCount: number
  onAnalyseNow: () => void
  onDismiss: () => void
}) {
  const [secondsLeft, setSecondsLeft] = useState(Math.round(SUGGEST_DELAY_MS / 1000))

  useEffect(() => {
    if (state !== 'watching') return
    setSecondsLeft(Math.round(SUGGEST_DELAY_MS / 1000))
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { clearInterval(interval); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [state, editCount])

  // ready state is persistent — user must dismiss manually
  // error state also stays until dismissed

  if (state === 'idle') return null

  if (state === 'ready') {
    return (
      <div className="mb-3 flex items-center gap-3 rounded-lg border border-[#534AB7]/30 bg-[#EEEDFE]/60 px-4 py-2.5 text-sm">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#534AB7] opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#534AB7]" />
        </span>
        <span className="flex-1 text-[#3C3489] font-medium">
          Backoffice AI has some rules for you to review
        </span>
        <a
          href="/rules"
          className="shrink-0 rounded-md bg-[#534AB7] px-3 py-1 text-xs text-white font-medium hover:bg-[#4338CA] transition-colors"
        >
          Review rules
        </a>
        <button
          onClick={onDismiss}
          className="shrink-0 text-[#534AB7]/50 hover:text-[#534AB7] leading-none"
          aria-label="Dismiss"
        >✕</button>
      </div>
    )
  }

  return (
    <div className={`mb-3 flex items-center gap-3 rounded-lg border px-4 py-2 text-xs ${
      state === 'error' ? 'border-red-200 bg-red-50' : 'border-black/8 bg-muted/40'
    }`}>

      {/* Icon / spinner */}
      {state === 'watching' && (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#534AB7] opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#534AB7]" />
        </span>
      )}
      {state === 'analysing' && (
        <span className="shrink-0 w-3 h-3 rounded-full border-2 border-[#534AB7] border-t-transparent animate-spin" />
      )}
      {state === 'error' && <span className="shrink-0">⚠️</span>}

      {/* Text */}
      <div className="flex-1 flex items-center gap-1.5 min-w-0">
        {state === 'watching' && (
          <span className="text-muted-foreground">
            Watching <span className="font-medium text-foreground">{editCount} edit{editCount !== 1 ? 's' : ''}</span> — suggesting rules in {secondsLeft}s
          </span>
        )}
        {state === 'analysing' && (
          <span className="text-muted-foreground">Analysing edits for rule patterns…</span>
        )}
        {state === 'error' && (
          <span className="text-red-600">Analysis failed — edit a transaction again to retry</span>
        )}
      </div>

      {/* Action */}
      {state === 'watching' && (
        <button
          onClick={onAnalyseNow}
          className="shrink-0 rounded-md bg-[#534AB7] px-2.5 py-1 text-white font-medium hover:bg-[#4338CA] transition-colors whitespace-nowrap"
        >
          Analyse now
        </button>
      )}

      {/* Dismiss — not shown while analysing */}
      {state !== 'analysing' && (
        <button
          onClick={onDismiss}
          className="shrink-0 text-muted-foreground hover:text-foreground leading-none"
          aria-label="Dismiss"
        >✕</button>
      )}
    </div>
  )
}

// ── Inline "Make rule from this change" — row-level ──────────────
interface MakeRuleSnapType {
  description: string
  payeeName: string | null
  categoryId: string | null
  categoryName: string | null
}

// ── Inline payee combobox (type to filter or create new) ──────────
function PayeeCell({
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
  const anchorRect = useAnchorRect(wrapRef, open)

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
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        const exact = payees.find((p) => p.name.toLowerCase() === draft.trim().toLowerCase())
        if (exact) onCommit(exact.id)
        else if (draft.trim() === '') onCommit(null)
        // If no match, leave as-is — don't call onCancel (that would exit row edit)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, payees])

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
      {open && (filtered.length > 0 || showCreate) && anchorRect && typeof document !== 'undefined' && ReactDOM.createPortal(
        <ul
          ref={listRef}
          data-portal-dropdown
          style={{ position: 'fixed', top: anchorRect.bottom + 2, left: anchorRect.left, width: anchorRect.width }}
          className="z-[9999] rounded border border-black/10 bg-white shadow-md text-[10px] max-h-44 overflow-y-auto"
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
        </ul>,
        document.body
      )}
    </div>
  )
}

// ── Funnel icon SVG ────────────────────────────────────────────────
function FunnelIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={`w-3 h-3 shrink-0 ${active ? 'text-[#534AB7]' : 'text-muted-foreground opacity-50'}`}
      fill={active ? 'currentColor' : 'none'}
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18l-7 9v6l-4-2v-4L3 4z" />
    </svg>
  )
}

// ── Column filter popover ──────────────────────────────────────────
function ColumnFilterPopover({
  column,
  isOpen,
  onOpen,
  onClose,
  filterValue,
  filterValue2,
  onChange,
  onChange2,
  type,
  options,
  groups,
  label,
}: {
  column: string
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
  filterValue: string
  filterValue2?: string
  onChange: (v: string) => void
  onChange2?: (v: string) => void
  type: 'text' | 'select' | 'optgroup-select' | 'amount-range' | 'date'
  options?: { value: string; label: string }[]
  groups?: CategoryGroup[]
  label: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const isActive = Boolean(filterValue || filterValue2)
  const anchorRect = useAnchorRect(wrapRef, isOpen)

  useEffect(() => {
    if (!isOpen) return
    function handler(e: MouseEvent) {
      const t = e.target as Node
      if (
        wrapRef.current && !wrapRef.current.contains(t) &&
        dropdownRef.current && !dropdownRef.current.contains(t)
      ) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen, onClose])

  return (
    <div ref={wrapRef} className="relative inline-flex items-center">
      <button
        onMouseDown={(e) => { e.stopPropagation(); isOpen ? onClose() : onOpen() }}
        className="p-0.5 rounded hover:bg-black/10 transition-colors"
        aria-label={`Filter by ${label}`}
        title={`Filter by ${label}`}
      >
        <FunnelIcon active={isActive} />
      </button>
      {isOpen && anchorRect && typeof document !== 'undefined' && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          data-portal-dropdown
          style={{ position: 'fixed', top: anchorRect.bottom + 4, left: anchorRect.left }}
          className="z-[9999] bg-white border border-black/10 rounded-lg shadow-lg p-2 min-w-[160px] whitespace-normal"
        >
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{label}</p>
          {type === 'text' && (
            <input
              autoFocus
              type="text"
              value={filterValue}
              onChange={(e) => onChange(e.target.value)}
              placeholder="contains…"
              className="w-full text-xs border border-black/15 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#534AB7]/30"
            />
          )}
          {type === 'select' && options && (
            <select
              autoFocus
              value={filterValue}
              onChange={(e) => { onChange(e.target.value); onClose() }}
              className="w-full text-xs border border-black/15 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#534AB7]/30"
            >
              <option value="">— All —</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}
          {type === 'optgroup-select' && groups && (
            <select
              autoFocus
              value={filterValue}
              onChange={(e) => { onChange(e.target.value); onClose() }}
              className="w-full text-xs border border-black/15 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#534AB7]/30"
            >
              <option value="">— All —</option>
              {groups.map((g) => (
                <optgroup key={g.id} label={g.name}>
                  {g.categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
          {type === 'amount-range' && (
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <label className="text-[10px] text-muted-foreground w-6 shrink-0">Min</label>
                <input
                  autoFocus
                  type="number"
                  value={filterValue}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 min-w-0 text-xs border border-black/15 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#534AB7]/30"
                />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-[10px] text-muted-foreground w-6 shrink-0">Max</label>
                <input
                  type="number"
                  value={filterValue2 ?? ''}
                  onChange={(e) => onChange2?.(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 min-w-0 text-xs border border-black/15 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#534AB7]/30"
                />
              </div>
            </div>
          )}
          {type === 'date' && (
            <div className="text-xs text-muted-foreground italic">Use date column header</div>
          )}
          {filterValue && (
            <button
              onMouseDown={(e) => { e.stopPropagation(); onChange(''); onChange2?.('') }}
              className="mt-1.5 text-[10px] text-[#534AB7] hover:underline"
            >
              Clear
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

// ── Sortable + filterable header cell ─────────────────────────────
function FilterableSortHeader({
  label,
  field,
  sortBy,
  sortDir,
  onSort,
  filterCol,
  openFilterCol,
  setOpenFilterCol,
  filterValue,
  filterValue2,
  onFilterChange,
  onFilterChange2,
  filterType,
  filterOptions,
  filterGroups,
  sortable = true,
  className = '',
}: {
  label: string
  field: string
  sortBy: SortField
  sortDir: SortDir
  onSort: (f: SortField) => void
  filterCol: string
  openFilterCol: string | null
  setOpenFilterCol: (col: string | null) => void
  filterValue: string
  filterValue2?: string
  onFilterChange: (v: string) => void
  onFilterChange2?: (v: string) => void
  filterType: 'text' | 'select' | 'optgroup-select' | 'amount-range' | 'date'
  filterOptions?: { value: string; label: string }[]
  filterGroups?: CategoryGroup[]
  sortable?: boolean
  className?: string
}) {
  const isSortActive = sortBy === (field as SortField)
  return (
    <th
      className={`px-3 py-1 text-left font-medium whitespace-nowrap relative ${className}`}
    >
      <div className="flex items-center gap-1">
        {sortable ? (
          <span
            className="cursor-pointer select-none hover:text-foreground"
            onClick={() => onSort(field as SortField)}
            aria-sort={isSortActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
          >
            {label}{isSortActive ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
          </span>
        ) : (
          <span className="select-none">{label}</span>
        )}
        <ColumnFilterPopover
          column={filterCol}
          isOpen={openFilterCol === filterCol}
          onOpen={() => setOpenFilterCol(filterCol)}
          onClose={() => setOpenFilterCol(null)}
          filterValue={filterValue}
          filterValue2={filterValue2}
          onChange={onFilterChange}
          onChange2={onFilterChange2}
          type={filterType}
          options={filterOptions}
          groups={filterGroups}
          label={label}
        />
      </div>
    </th>
  )
}

// ── Date filter header ─────────────────────────────────────────────
function DateFilterHeader({
  sortBy,
  sortDir,
  onSort,
  dateFrom,
  dateTo,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  onApplyPreset,
  onApplyCustom,
  onClear,
  openFilterCol,
  setOpenFilterCol,
}: {
  sortBy: SortField
  sortDir: SortDir
  onSort: (f: SortField) => void
  dateFrom: string
  dateTo: string
  customFrom: string
  customTo: string
  onCustomFromChange: (v: string) => void
  onCustomToChange: (v: string) => void
  onApplyPreset: (preset: 'this-month' | 'last-month' | 'last-3-months' | 'last-6-months' | 'ytd') => void
  onApplyCustom: () => void
  onClear: () => void
  openFilterCol: string | null
  setOpenFilterCol: (col: string | null) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const isOpen = openFilterCol === 'date'
  const isActive = Boolean(dateFrom || dateTo)
  const isSortActive = sortBy === 'date'
  const anchorRect = useAnchorRect(wrapRef, isOpen)

  useEffect(() => {
    if (!isOpen) return
    function handler(e: MouseEvent) {
      const t = e.target as Node
      if (
        wrapRef.current && !wrapRef.current.contains(t) &&
        dropdownRef.current && !dropdownRef.current.contains(t)
      ) {
        setOpenFilterCol(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen, setOpenFilterCol])

  return (
    <th className="px-3 py-1 text-left font-medium whitespace-nowrap relative">
      <div className="flex items-center gap-1" ref={wrapRef}>
        <span
          className="cursor-pointer select-none hover:text-foreground"
          onClick={() => onSort('date')}
          aria-sort={isSortActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
        >
          Date{isSortActive ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
        </span>
        <button
          onMouseDown={(e) => { e.stopPropagation(); isOpen ? setOpenFilterCol(null) : setOpenFilterCol('date') }}
          className="p-0.5 rounded hover:bg-black/10 transition-colors"
          aria-label="Filter by date"
          title="Filter by date"
        >
          <FunnelIcon active={isActive} />
        </button>
        {isOpen && anchorRect && typeof document !== 'undefined' && ReactDOM.createPortal(
          <div
            ref={dropdownRef}
            data-portal-dropdown
            style={{ position: 'fixed', top: anchorRect.bottom + 4, left: anchorRect.left }}
            className="z-[9999] bg-white border border-black/10 rounded-lg shadow-lg w-52 p-3 space-y-3 whitespace-normal"
          >
            <div className="space-y-1">
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Quick select</p>
              {([
                ['this-month', 'This month'],
                ['last-month', 'Last month'],
                ['last-3-months', 'Last 3 months'],
                ['last-6-months', 'Last 6 months'],
                ['ytd', 'Year to date'],
              ] as const).map(([preset, lbl]) => (
                <button
                  key={preset}
                  onMouseDown={(e) => { e.stopPropagation(); onApplyPreset(preset); setOpenFilterCol(null) }}
                  className="w-full text-left text-xs px-2 py-1.5 rounded-md hover:bg-muted/60 transition-colors"
                >
                  {lbl}
                </button>
              ))}
            </div>
            <div className="border-t border-black/5 pt-3 space-y-2">
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Custom range</p>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => onCustomFromChange(e.target.value)}
                className="w-full text-xs border border-black/15 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#534AB7]/30"
              />
              <input
                type="date"
                value={customTo}
                onChange={(e) => onCustomToChange(e.target.value)}
                className="w-full text-xs border border-black/15 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#534AB7]/30"
              />
              <button
                onMouseDown={(e) => { e.stopPropagation(); onApplyCustom(); setOpenFilterCol(null) }}
                disabled={!customFrom && !customTo}
                className="w-full text-xs py-1.5 rounded-md bg-[#3C3489] text-[#EEEDFE] hover:bg-[#2d2770] disabled:opacity-40 transition-colors"
              >
                Apply
              </button>
            </div>
            {isActive && (
              <button
                onMouseDown={(e) => { e.stopPropagation(); onClear(); setOpenFilterCol(null) }}
                className="text-[10px] text-[#534AB7] hover:underline"
              >
                Clear date filter
              </button>
            )}
          </div>,
          document.body
        )}
      </div>
    </th>
  )
}

// ── Main component ─────────────────────────────────────────────────
const todayISO = new Date().toISOString().slice(0, 10)

export function TransactionTable({ initialRows, initialTotal, initialWorkspaces, initialCategoryGroups, initialPayees, initialAccounts }: Props) {
  const [localRows, setLocalRows] = useState<TransactionWithRelations[]>(initialRows ?? [])
  const [total, setTotal] = useState(initialTotal ?? 0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(!initialRows)

  // ── New row state ──────────────────────────────────────────────────
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>(initialAccounts ?? [])
  const [addingRow, setAddingRow] = useState(false)
  const [newRow, setNewRow] = useState({ accountId: '', date: todayISO, amount: '', description: '', categoryId: '', payeeId: '', projectId: '', notes: '' })
  const [savingNew, setSavingNew] = useState(false)
  const [newRowError, setNewRowError] = useState<string | null>(null)

  // Column filters
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [aiMode, setAiMode] = useState(false)
  const [aiQuery, setAiQuery] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiExplanation, setAiExplanation] = useState('')
  const [filters, setFilters] = useState<ColumnFilters>({})
  const [debouncedFilters, setDebouncedFilters] = useState<ColumnFilters>({})
  const [openFilterCol, setOpenFilterCol] = useState<string | null>(null)

  // Date filter
  type DatePreset = 'this-month' | 'last-month' | 'last-3-months' | 'last-6-months' | 'ytd'
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  function applyPreset(preset: DatePreset) {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    let from: Date
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    switch (preset) {
      case 'this-month': from = new Date(now.getFullYear(), now.getMonth(), 1); break
      case 'last-month': from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        to.setFullYear(now.getFullYear()); to.setMonth(now.getMonth()); to.setDate(0); break
      case 'last-3-months': from = new Date(now.getFullYear(), now.getMonth() - 2, 1); break
      case 'last-6-months': from = new Date(now.getFullYear(), now.getMonth() - 5, 1); break
      case 'ytd': from = new Date(now.getFullYear(), 0, 1); break
    }
    setDateFrom(fmt(from))
    setDateTo(fmt(to))
    setPage(1)
  }

  function applyCustomDates() {
    if (!customFrom && !customTo) return
    setDateFrom(customFrom)
    setDateTo(customTo)
    setPage(1)
  }

  function clearDateFilter() {
    setDateFrom('')
    setDateTo('')
    setCustomFrom('')
    setCustomTo('')
    setPage(1)
  }

  // Debounce search at 400ms
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [search])

  // Debounce text filters at 600ms
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedFilters(filters); setPage(1) }, 600)
    return () => clearTimeout(t)
  }, [filters])

  const [error, setError] = useState<string | null>(null)

  const [sortBy, setSortBy] = useState<SortField>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [editingRowInitialField, setEditingRowInitialField] = useState<EditableField | null>(null)
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [errorIds, setErrorIds] = useState<Set<string>>(new Set())

  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkDeletedCount, setBulkDeletedCount] = useState(0)

  const [projects, setWorkspaces] = useState<Workspace[]>(initialWorkspaces ?? [])
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>(initialCategoryGroups ?? [])
  const [payees, setPayees] = useState<Payee[]>(initialPayees ?? [])

  // ── Edit queue for deferred rule suggestions ──────────────────────
  const editQueueRef = useRef<Map<string, TransactionWithRelations>>(new Map())
  const suggestionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [rulePromptState, setRulePromptState] = useState<RulePromptState>('idle')
  const [watchingEditCount, setWatchingEditCount] = useState(0)

  // ── "Make rule from this change" ─────────────────────────────────
  const [makeRuleSnap, setMakeRuleSnap] = useState<MakeRuleSnapType | null>(null)
  const [showMakeRuleEditor, setShowMakeRuleEditor] = useState(false)
  const [lastEditedRowId, setLastEditedRowId] = useState<string | null>(null)
  // Pending snap accumulates edits while the user is still on the same row.
  // It only becomes the visible popup once the user moves to a different row.
  const pendingRuleSnapRef = useRef<{ rowId: string; snap: MakeRuleSnapType } | null>(null)

  // ── Toolbar modals ────────────────────────────────────────────────
  const [showNewRuleModal, setShowNewRuleModal] = useState(false)
  const [showAgentModal, setShowAgentModal] = useState(false)

  const pageSize = 200

  // ── Fire suggestion request (shared between timer + manual trigger) ─
  const fireSuggestions = useCallback(() => {
    if (suggestionTimerRef.current) { clearTimeout(suggestionTimerRef.current); suggestionTimerRef.current = null }
    const queue = editQueueRef.current
    if (queue.size === 0) { setRulePromptState('idle'); return }
    const snapshots = Array.from(queue.values())
    editQueueRef.current = new Map()
    setWatchingEditCount(0)
    setRulePromptState('analysing')
    console.log('[suggest-from-edits] firing for', snapshots.length, 'edits', snapshots)
    fetch('/api/rules/suggest-from-edits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ edits: snapshots }),
    })
      .then((r) => r.json())
      .then((j) => {
        console.log('[suggest-from-edits] response:', j)
        if (!j.error && j.data?.count > 0) {
          setRulePromptState('ready')
        } else {
          setRulePromptState('idle')
        }
      })
      .catch((e) => {
        console.error('[suggest-from-edits] fetch error:', e)
        setRulePromptState('error')
      })
  }, [])

  // Tracks the current editingRowId in a ref to avoid stale closure issues.
  const editingRowIdRef = useRef(editingRowId)
  useEffect(() => { editingRowIdRef.current = editingRowId }, [editingRowId])

  // Outside-click: exit row edit when user clicks outside the editing row.
  // Use capture phase so this fires before React processes any synthetic events
  // (including e.preventDefault() calls on dropdown items). At capture time the
  // clicked element is still in the DOM and closest('[data-row-id]') reliably
  // identifies which row was clicked.
  useEffect(() => {
    if (!editingRowId) return
    const rowId = editingRowId
    function handler(e: MouseEvent) {
      const target = e.target as Element | null
      // Clicks inside portal dropdowns (CategoryCell, PayeeCell, filter popovers)
      // land on document.body descendants with no [data-row-id] ancestor.
      // Don't exit row edit for those — the cell components own their own commit logic.
      if (target?.closest('[data-portal-dropdown]')) return
      const clickedRowId = target?.closest('[data-row-id]')?.getAttribute('data-row-id')
      if (clickedRowId !== rowId) {
        exitRowEdit(rowId)
      }
    }
    document.addEventListener('mousedown', handler, true) // capture phase
    return () => document.removeEventListener('mousedown', handler, true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingRowId])

  const promoteIfLeft = useCallback((fromRowId: string) => {
    const pending = pendingRuleSnapRef.current
    if (!pending || pending.rowId !== fromRowId) return
    if (editingRowIdRef.current === fromRowId) return // still editing same row

    // User has genuinely left — show popup and start banner
    setMakeRuleSnap(null)
    setShowMakeRuleEditor(false)
    requestAnimationFrame(() => {
      setMakeRuleSnap(pending.snap)
      setLastEditedRowId(pending.rowId)
      pendingRuleSnapRef.current = null
    })

    const queueSize = editQueueRef.current.size
    if (queueSize > 0) {
      setWatchingEditCount(queueSize)
      setRulePromptState('watching')
      if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current)
      suggestionTimerRef.current = setTimeout(fireSuggestions, SUGGEST_DELAY_MS)
    }
  }, [fireSuggestions])

  // Load projects, categories, payees, accounts once (skip if passed from server)
  useEffect(() => {
    if (initialWorkspaces && initialCategoryGroups && initialPayees) return
    if (!initialWorkspaces) fetch('/api/projects').then((r) => r.json()).then((j) => { if (!j.error) setWorkspaces(j.data ?? []) }).catch(() => {})
    if (!initialCategoryGroups) fetch('/api/category-groups').then((r) => r.json()).then((j) => { if (!j.error) setCategoryGroups(j.data ?? []) }).catch(() => {})
    if (!initialPayees) fetch('/api/payees').then((r) => r.json()).then((j) => { if (!j.error) setPayees(j.data ?? []) }).catch(() => {})
  }, [initialWorkspaces, initialCategoryGroups, initialPayees])

  useEffect(() => {
    if (initialAccounts) return
    fetch('/api/accounts').then((r) => r.json()).then((j) => { if (!j.error) setAccounts(j.data ?? []) }).catch(() => {})
  }, [initialAccounts])

  // Track whether this is the very first render with server data
  const isFirstRender = useRef(true)

  // Derive unique account names from loaded rows for account filter
  const accountOptions = Array.from(
    new Map(localRows.map((r) => [r.account.name, r.account.name])).entries()
  ).map(([name]) => ({ value: name, label: name }))

  // Fetch transactions
  const fetchTransactions = useCallback(() => {
    const hasFilters = Object.values(debouncedFilters).some(Boolean) || debouncedSearch || dateFrom || dateTo
    if (isFirstRender.current && initialRows && page === 1 && !hasFilters && sortBy === 'date' && sortDir === 'desc') {
      isFirstRender.current = false
      return () => {}
    }
    isFirstRender.current = false

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sortBy,
      sortDir,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(debouncedFilters.description ? { description: debouncedFilters.description } : {}),
      ...(debouncedFilters.accountName ? { accountName: debouncedFilters.accountName } : {}),
      ...(debouncedFilters.payeeName ? { payeeName: debouncedFilters.payeeName } : {}),
      ...(debouncedFilters.notes ? { notes: debouncedFilters.notes } : {}),
      ...(debouncedFilters.categoryId ? { categoryId: debouncedFilters.categoryId } : {}),
      ...(debouncedFilters.categoryGroupId ? { categoryGroupId: debouncedFilters.categoryGroupId } : {}),
      ...(debouncedFilters.projectId ? { projectId: debouncedFilters.projectId } : {}),
      ...(debouncedFilters.amountMin ? { amountMin: debouncedFilters.amountMin } : {}),
      ...(debouncedFilters.amountMax ? { amountMax: debouncedFilters.amountMax } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    })

    fetch(`/api/transactions?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) { setError(json.error); return }
        setLocalRows(json.data ?? [])
        setTotal(json.meta?.total ?? 0)
        setSelectedIds(new Set())
      })
      .catch((e) => { if (e.name !== 'AbortError') setError('Failed to load transactions') })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [page, pageSize, debouncedSearch, debouncedFilters, sortBy, sortDir, dateFrom, dateTo, initialRows])

  useEffect(() => {
    return fetchTransactions()
  }, [fetchTransactions])

  // ── Active filter count ───────────────────────────────────────────
  const activeFilterCount = Object.values(debouncedFilters).filter(Boolean).length + (debouncedSearch ? 1 : 0) + (dateFrom || dateTo ? 1 : 0)
  const hasActiveFilters = activeFilterCount > 0

  function clearAllFilters() {
    setSearch(''); setDebouncedSearch('')
    setFilters({})
    setDebouncedFilters({})
    setDateFrom(''); setDateTo(''); setCustomFrom(''); setCustomTo('')
    setPage(1)
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  async function handleAiSearch() {
    const q = aiQuery.trim()
    if (!q || aiLoading) return
    setAiLoading(true)
    setAiExplanation('')
    setError(null)

    try {
      const res = await fetch('/api/agent/search-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      const json = await res.json()
      if (json.error) { setError(json.error); return }

      const f = json.data.filters
      setFilters({
        description: f.description || undefined,
        accountName: f.accountName || undefined,
        payeeName: f.payeeName || undefined,
        categoryId: f.categoryId || undefined,
        projectId: f.projectId || undefined,
        amountMin: f.amountMin || undefined,
        amountMax: f.amountMax || undefined,
        notes: undefined,
      })
      setDebouncedFilters({
        description: f.description || undefined,
        accountName: f.accountName || undefined,
        payeeName: f.payeeName || undefined,
        categoryId: f.categoryId || undefined,
        projectId: f.projectId || undefined,
        amountMin: f.amountMin || undefined,
        amountMax: f.amountMax || undefined,
        notes: undefined,
      })
      if (f.search) { setSearch(f.search); setDebouncedSearch(f.search) }
      else { setSearch(''); setDebouncedSearch('') }
      if (f.dateFrom) setDateFrom(f.dateFrom)
      if (f.dateTo) setDateTo(f.dateTo)
      if (f.sortBy) setSortBy(f.sortBy as SortField)
      if (f.sortDir) setSortDir(f.sortDir as SortDir)
      setPage(1)
      setAiExplanation(json.data.explanation || '')
    } catch {
      setError('AI search failed')
    } finally {
      setAiLoading(false)
    }
  }

  function clearAiSearch() {
    setAiMode(false)
    setAiQuery('')
    setAiExplanation('')
    clearAllFilters()
  }

  // ── Sorting ──────────────────────────────────────────────────────
  function handleSort(field: SortField) {
    if (sortBy === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDir('desc')
    }
    setPage(1)
  }

  // ── Inline edit ──────────────────────────────────────────────────
  function startEdit(id: string, field: EditableField) {
    if (selectMode || savingIds.has(id) || deletingIds.has(id)) return
    // Clear any lingering "make rule" popup from a previous row
    setMakeRuleSnap(null)
    setShowMakeRuleEditor(false)
    pendingRuleSnapRef.current = null
    setEditingRowId(id)
    setEditingRowInitialField(field)
  }

  function exitRowEdit(id: string) {
    setEditingRowId(null)
    setEditingRowInitialField(null)
    editingRowIdRef.current = null // update ref immediately so promoteIfLeft sees it
    promoteIfLeft(id)
  }

  async function commitEdit(id: string, field: EditableField, rawValue: string | null, freshPayee?: Payee) {
    const row = localRows.find((r) => r.id === id)
    if (!row) return

    // Build patch value
    let patchValue: string | number | null = rawValue
    if (field === 'amount') {
      const n = parseFloat(rawValue ?? '')
      if (isNaN(n)) return // invalid number — discard
      patchValue = n
    }
    if (field === 'date') {
      if (!rawValue) return
      const d = new Date(rawValue)
      if (isNaN(d.getTime())) return // invalid date — discard
      patchValue = d.toISOString()
    }

    // Optimistic update
    setLocalRows((rows) =>
      rows.map((r) => {
        if (r.id !== id) return r
        if (field === 'projectId') {
          const workspace = projects.find((p) => p.id === rawValue) ?? null
          return { ...r, workspaceId: rawValue, workspace }
        }
        if (field === 'categoryId') {
          const allCats = categoryGroups.flatMap((g) => g.categories)
          const cat = allCats.find((c) => c.id === rawValue)
          const group = categoryGroups.find((g) => g.categories.some((c) => c.id === rawValue))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const categoryRef = cat && group ? { ...cat, group } as any : null
          return { ...r, categoryId: rawValue, category: cat?.name ?? null, categoryRef }
        }
        if (field === 'payeeId') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const payee = (freshPayee ?? payees.find((p) => p.id === rawValue) ?? null) as any
          return { ...r, payeeId: rawValue, payee }
        }
        if (field === 'date') {
          return { ...r, date: new Date(rawValue!) }
        }
        return { ...r, [field]: patchValue }
      })
    )

    setSavingIds((s) => new Set(s).add(id))

    try {
      // For categoryId, keep the denormalised category string in sync.
      // projectId is the UI field name but the API/Prisma field is workspaceId.
      const apiField = field === 'projectId' ? 'workspaceId' : field
      const patchBody: Record<string, unknown> = { [apiField]: patchValue }
      if (field === 'categoryId') {
        const allCats = categoryGroups.flatMap((g) => g.categories)
        const cat = rawValue ? allCats.find((c) => c.id === rawValue) : null
        patchBody.category = cat?.name ?? null
      }

      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      })
      if (!res.ok) throw new Error('patch failed')

      // Queue this edit for deferred rule suggestion generation.
      // Only category and payee changes are worth suggesting rules for.
      if (field === 'categoryId' || field === 'category' || field === 'payeeId') {
        const allCats = categoryGroups.flatMap((g) => g.categories)
        const resolvedCatName =
          field === 'categoryId'
            ? (allCats.find((c) => c.id === rawValue)?.name ?? null)
            : field === 'category'
            ? (rawValue ?? null)
            : (row.categoryRef?.name ?? (row as unknown as Record<string, unknown>).category as string ?? null)
        const resolvedPayeeName =
          field === 'payeeId'
            ? (freshPayee?.name ?? payees.find((p) => p.id === rawValue)?.name ?? null)
            : (row.payee?.name ?? null)
        const resolvedCatId = field === 'categoryId' ? rawValue : (row.categoryId ?? null)

        const editSnapshot = {
          id: row.id,
          description: row.description,
          payeeName: resolvedPayeeName,
          categoryId: resolvedCatId,
          categoryName: resolvedCatName,
          amount: Number(row.amount),
        }
        const existing = editQueueRef.current.get(id) as unknown as typeof editSnapshot | undefined
        const merged = existing ? { ...existing, ...editSnapshot } : editSnapshot
        editQueueRef.current.set(id, merged as unknown as TransactionWithRelations)

        // Stage the popup snap — don't show it yet.
        // promoteIfLeft is called from exitRowEdit once the user leaves the row.
        pendingRuleSnapRef.current = {
          rowId: id,
          snap: {
            description: row.description,
            payeeName: resolvedPayeeName,
            categoryId: resolvedCatId,
            categoryName: resolvedCatName,
          },
        }

        // promoteIfLeft is called from exitRowEdit — no deferred call here.
      }
    } catch {
      // Revert on error
      if (row) {
        setLocalRows((rows) => rows.map((r) => (r.id === id ? row : r)))
      }
      setErrorIds((s) => new Set(s).add(id))
      setTimeout(() => setErrorIds((s) => { const n = new Set(s); n.delete(id); return n }), 1500)
    } finally {
      setSavingIds((s) => { const n = new Set(s); n.delete(id); return n })
    }
  }

  // ── New row handlers ──────────────────────────────────────────────
  function resetNewRow() {
    setNewRow({ accountId: '', date: todayISO, amount: '', description: '', categoryId: '', payeeId: '', projectId: '', notes: '' })
    setNewRowError(null)
  }

  async function handleSaveNewRow() {
    if (!newRow.accountId || !newRow.date || newRow.amount === '' || !newRow.description) {
      setNewRowError('Account, date, amount and description are required.')
      return
    }
    setSavingNew(true)
    setNewRowError(null)
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: newRow.accountId,
          date: newRow.date,
          amount: parseFloat(newRow.amount),
          description: newRow.description,
          ...(newRow.categoryId ? { categoryId: newRow.categoryId } : {}),
          ...(newRow.payeeId ? { payeeId: newRow.payeeId } : {}),
          ...(newRow.projectId ? { projectId: newRow.projectId } : {}),
          ...(newRow.notes ? { notes: newRow.notes } : {}),
        }),
      })
      const json = await res.json()
      if (json.error) { setNewRowError(json.error); setSavingNew(false); return }
      setLocalRows((prev) => [json.data, ...prev])
      setTotal((t) => t + 1)
      setAddingRow(false)
      resetNewRow()
    } catch {
      setNewRowError('Failed to save transaction.')
    } finally {
      setSavingNew(false)
    }
  }

  function handleCancelNewRow() {
    setAddingRow(false)
    resetNewRow()
  }

  // ── Bulk delete ───────────────────────────────────────────────────
  async function confirmBulkDelete() {
    if (selectedIds.size === 0) { setSelectMode(false); return }
    setSelectMode(false)
    setBulkDeleting(true)
    setBulkDeletedCount(0)
    const ids = Array.from(selectedIds)
    ids.forEach((id) => setDeletingIds((s) => new Set(s).add(id)))

    let deleted = 0
    await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/transactions/${id}`, { method: 'DELETE' }).then((r) => {
          if (!r.ok) throw new Error('failed')
          setLocalRows((rows) => rows.filter((r) => r.id !== id))
          setDeletingIds((s) => { const n = new Set(s); n.delete(id); return n })
          deleted++
          setBulkDeletedCount(deleted)
        })
      )
    )

    setSelectedIds(new Set())
    setTotal((t) => t - deleted)
    setBulkDeleting(false)
    setBulkDeletedCount(0)
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  // ── Checkbox helpers ──────────────────────────────────────────────
  const allChecked = localRows.length > 0 && localRows.every((r) => selectedIds.has(r.id))
  const someChecked = selectedIds.size > 0

  function toggleAll() {
    if (allChecked) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(localRows.map((r) => r.id)))
    }
  }

  function toggleRow(id: string) {
    setSelectedIds((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  // ── Cell renderer ─────────────────────────────────────────────────
  function renderEditableCell(row: TransactionWithRelations, field: EditableField) {
    const isEditing = editingRowId === row.id
    const isInitialField = editingRowInitialField === field
    const isSaving = savingIds.has(row.id)
    const hasError = errorIds.has(row.id)

    let displayValue: string
    if (field === 'projectId') {
      displayValue = row.workspace?.name ?? '—'
    } else if (field === 'categoryId') {
      displayValue = row.categoryRef?.name ?? row.category ?? '—'
    } else if (field === 'payeeId') {
      displayValue = row.payee?.name ?? '—'
    } else if (field === 'amount') {
      const n = Number(row.amount)
      displayValue = (n >= 0 ? '+' : '') + n.toFixed(2)
    } else if (field === 'date') {
      displayValue = new Date(row.date).toLocaleDateString()
    } else {
      displayValue = (row[field as keyof TransactionWithRelations] as string | null) ?? '—'
    }

    const cellClass = [
      'px-3 py-0.5 cursor-pointer',
      isSaving ? 'opacity-50' : '',
      hasError ? 'ring-1 ring-inset ring-red-400 rounded' : '',
      field === 'amount' ? 'text-right font-mono' : '',
      field === 'amount' && Number(row.amount) >= 0 ? 'text-green-600' : '',
      field === 'amount' && Number(row.amount) < 0 ? 'text-red-600' : '',
    ].filter(Boolean).join(' ')

    if (isEditing) {
      if (field === 'projectId') {
        return (
          <td key={field} className="px-3 py-0.5 min-w-[120px]">
            <WorkspaceCell
              value={row.workspaceId ?? null}
              projects={projects}
              autoFocus={isInitialField}
              onCommit={(v) => commitEdit(row.id, 'projectId', v)}
              onCancel={() => exitRowEdit(row.id)}
            />
          </td>
        )
      }

      if (field === 'categoryId') {
        return (
          <td key={field} className="px-3 py-0.5 min-w-[160px]">
            <CategoryCell
              value={row.categoryId ?? null}
              groups={categoryGroups}
              description={row.description}
              payeeName={row.payee?.name ?? null}
              amount={Number(row.amount)}
              autoFocus={isInitialField}
              onCommit={(v) => commitEdit(row.id, 'categoryId', v)}
              onCancel={() => exitRowEdit(row.id)}
            />
          </td>
        )
      }

      if (field === 'payeeId') {
        return (
          <td key={field} className="px-3 py-0.5 min-w-[140px]">
            <PayeeCell
              value={row.payeeId ?? null}
              payees={payees}
              onCommit={(v) => commitEdit(row.id, 'payeeId', v)}
              onCancel={() => exitRowEdit(row.id)}
              onNewPayee={(p) => {
                setPayees((prev) => [...prev, p].sort((a, b) => a.name.localeCompare(b.name)))
                commitEdit(row.id, 'payeeId', p.id, p)
              }}
            />
          </td>
        )
      }

      if (field === 'date') {
        const isoDate = new Date(row.date).toISOString().slice(0, 10)
        return (
          <td key={field} className="px-3 py-0.5 min-w-[130px]">
            <TextCell
              value={isoDate}
              type="date"
              autoFocus={isInitialField}
              onCommit={(v) => commitEdit(row.id, 'date', v)}
              onCancel={() => exitRowEdit(row.id)}
            />
          </td>
        )
      }

      const rawVal =
        field === 'amount'
          ? String(Number(row.amount))
          : (row[field as keyof TransactionWithRelations] as string | null) ?? ''

      return (
        <td key={field} className="px-3 py-0.5 min-w-[100px]">
          <TextCell
            value={rawVal as string}
            type={field === 'amount' ? 'number' : 'text'}
            autoFocus={isInitialField}
            onCommit={(v) => commitEdit(row.id, field, v)}
            onCancel={() => exitRowEdit(row.id)}
          />
        </td>
      )
    }

    return (
      <td
        key={field}
        className={cellClass}
        onClick={() => { if (!isEditing) startEdit(row.id, field) }}
        title="Click to edit"
        data-testid={`cell-${field}`}
      >
        {field === 'categoryId' ? (
          <span className={displayValue !== '—' ? 'text-[10px] rounded-full bg-blue-100 text-blue-700 px-1.5 py-px max-w-[120px] truncate block' : ''}>
            {displayValue}
          </span>
        ) : field === 'notes' ? (
          <span className="flex items-center gap-1 max-w-[200px]">
            {(row.receipts?.length ?? 0) > 0 && (
              <a
                href="/receipts"
                onClick={(e) => e.stopPropagation()}
                title={`${row.receipts.length} receipt${row.receipts.length > 1 ? 's' : ''} attached`}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
                {(row.receipts?.length ?? 0) > 1 && (
                  <span className="text-[10px] ml-0.5">{row.receipts.length}</span>
                )}
              </a>
            )}
            <span className="truncate block">{displayValue}</span>
          </span>
        ) : (
          <span className={field === 'description' ? 'max-w-[180px] truncate block' : ''}>
            {displayValue}
          </span>
        )}
      </td>
    )
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-3" data-testid="transaction-table">
      {/* Rule prompt — watching / analysing / ready / error */}
      <RulePromptPanel
        state={rulePromptState}
        editCount={watchingEditCount}
        onAnalyseNow={fireSuggestions}
        onDismiss={() => setRulePromptState('idle')}
      />

      {/* Toolbar */}
      <style>{`
        @keyframes bulkDeletePulse {
          0%, 100% { background-color: #dc2626; }
          50% { background-color: #991b1b; }
        }
      `}</style>
      <div className="flex items-center gap-3 flex-wrap">

        {/* ── Search (left-aligned) ─────────────────────────── */}
        <div className="flex items-center gap-1">
          {aiMode ? (
            <>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Describe what you're looking for…"
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAiSearch() }}
                  className="rounded-md border border-purple-300 bg-purple-50/50 px-3 py-1.5 text-xs w-72 pr-7 focus:outline-none focus:ring-1 focus:ring-purple-400"
                  aria-label="AI search transactions"
                  data-testid="ai-search-input"
                  disabled={aiLoading}
                />
                {aiLoading && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg className="w-3.5 h-3.5 animate-spin text-purple-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                  </span>
                )}
              </div>
              <button
                onClick={handleAiSearch}
                disabled={aiLoading || !aiQuery.trim()}
                className="rounded-md bg-purple-600 px-2.5 py-1.5 text-xs text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
                data-testid="ai-search-btn"
              >
                Search
              </button>
              <button
                onClick={clearAiSearch}
                className="text-xs text-muted-foreground hover:text-foreground px-1"
                title="Switch to keyword search"
                aria-label="Exit AI search"
              >
                ✕
              </button>
            </>
          ) : (
            <>
              <div className="relative">
                <input
                  type="search"
                  placeholder="Search transactions…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="rounded-md border px-3 py-1.5 text-xs w-52 pr-7"
                  aria-label="Search transactions"
                  data-testid="transaction-search"
                />
                {loading && search && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg className="w-3.5 h-3.5 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                  </span>
                )}
              </div>
              {/* AI toggle with tooltip */}
              <div className="relative group">
                <button
                  onClick={() => setAiMode(true)}
                  className="rounded-md border border-purple-200 bg-purple-50 px-2 py-1.5 text-xs text-purple-700 hover:bg-purple-100 transition-colors flex items-center gap-1"
                  aria-label="AI search"
                  data-testid="ai-search-toggle"
                >
                  <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4" strokeLinecap="round"/>
                  </svg>
                  AI
                </button>
                <div className="pointer-events-none absolute left-0 top-full mt-1.5 z-50 w-64 rounded-lg border border-purple-200 bg-white px-3 py-2.5 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <p className="text-[11px] font-medium text-purple-800 mb-1">AI search</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Describe the transactions you&apos;re looking for in plain language — e.g. <span className="italic">&quot;all Uber rides last month&quot;</span>, <span className="italic">&quot;expenses over £200 in Q1&quot;</span>, or <span className="italic">&quot;rent payments from 2024&quot;</span>.
                  </p>
                  <p className="text-[10px] text-purple-600 mt-1.5 font-medium">You must click the Search button (or press Enter) to run the search.</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Spacer ────────────────────────────────────────── */}
        <div className="flex-1" />

        {/* ── Transaction actions group ─────────────────────── */}
        <div className="flex items-center gap-px rounded-lg border border-black/10 bg-black/[0.03] p-0.5">
          {!addingRow && (
            <button
              onClick={() => setAddingRow(true)}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium hover:bg-white hover:shadow-sm transition-all"
              data-testid="new-transaction-btn"
            >
              + New transaction
            </button>
          )}
          <a
            href="/upload"
            className="rounded-md px-2.5 py-1.5 text-xs font-medium hover:bg-white hover:shadow-sm transition-all"
          >
            ↑ Upload CSV
          </a>
          {!bulkDeleting && (
            selectMode ? (
              <div className="flex items-center gap-1 pl-0.5">
                {selectedIds.size > 0 && (
                  <span className="text-xs text-muted-foreground px-1">{selectedIds.size} selected</span>
                )}
                <button
                  onClick={confirmBulkDelete}
                  className="rounded-md px-2.5 py-1.5 text-xs font-medium text-white"
                  style={{
                    backgroundColor: '#dc2626',
                    animation: selectedIds.size > 0 ? 'bulkDeletePulse 2s ease-in-out infinite' : 'none',
                  }}
                  data-testid="bulk-delete-confirm-btn"
                  aria-label="Confirm delete selected"
                >
                  {selectedIds.size > 0 ? `Delete ${selectedIds.size}` : 'Select transactions'}
                </button>
                <button
                  onClick={exitSelectMode}
                  className="text-muted-foreground hover:text-foreground leading-none px-1.5 text-sm"
                  aria-label="Cancel selection"
                >✕</button>
              </div>
            ) : (
              <button
                onClick={() => setSelectMode(true)}
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-white hover:shadow-sm transition-all"
                data-testid="delete-transactions-btn"
              >
                Delete transactions
              </button>
            )
          )}
          {bulkDeleting && (
            <div className="flex items-center gap-1.5 px-2.5 text-xs" role="status" aria-live="polite">
              <span className="inline-block w-3 h-3 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
              <span className="text-muted-foreground">Deleting {bulkDeletedCount} of {bulkDeletedCount + deletingIds.size}…</span>
            </div>
          )}
        </div>

        {/* ── Rules group ───────────────────────────────────── */}
        <div className="flex items-center gap-px rounded-lg border border-[#534AB7]/20 bg-[#EEEDFE]/40 p-0.5">
          <button
            type="button"
            onClick={() => setShowNewRuleModal(true)}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-[#3C3489] hover:bg-[#EEEDFE] hover:shadow-sm transition-all"
          >
            + Create rule
          </button>
          <button
            type="button"
            onClick={() => setShowAgentModal(true)}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-[#3C3489] hover:bg-[#EEEDFE] hover:shadow-sm transition-all"
          >
            Run rules agent
          </button>
        </div>

        {/* ── Active filters ────────────────────────────────── */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#3C3489] bg-[#EEEDFE] border border-[#534AB7]/20 rounded-full px-2.5 py-1">
              {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
            </span>
            <button
              onClick={clearAllFilters}
              className="text-xs text-muted-foreground hover:text-foreground border border-black/10 rounded-lg px-2.5 py-1.5 transition-colors"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* ── Transaction count ─────────────────────────────── */}
        <p className="text-xs text-muted-foreground">
          {loading && total === 0 ? 'Loading…' : `${total} transaction${total !== 1 ? 's' : ''}`}
        </p>

      </div>

      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

      {aiExplanation && (
        <div className="flex items-center gap-2 rounded-md border border-purple-200 bg-purple-50/50 px-3 py-2 text-xs text-purple-800">
          <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4" strokeLinecap="round"/>
          </svg>
          <span>{aiExplanation}</span>
          <button onClick={clearAiSearch} className="ml-auto text-purple-500 hover:text-purple-700">✕</button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-auto rounded-lg border">
        <table className="w-full text-[11px]" aria-label="Transactions">
          <thead className="bg-muted text-[10px] uppercase tracking-wide">
            <tr>
              {/* Checkbox — only shown in select mode */}
              <th className="px-3 py-1 w-8">
                {selectMode && (
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked }}
                    onChange={toggleAll}
                    aria-label="Select all rows"
                    data-testid="select-all-checkbox"
                    className="cursor-pointer"
                  />
                )}
              </th>

              {/* Date column with filter */}
              <DateFilterHeader
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
                dateFrom={dateFrom}
                dateTo={dateTo}
                customFrom={customFrom}
                customTo={customTo}
                onCustomFromChange={setCustomFrom}
                onCustomToChange={setCustomTo}
                onApplyPreset={applyPreset}
                onApplyCustom={applyCustomDates}
                onClear={clearDateFilter}
                openFilterCol={openFilterCol}
                setOpenFilterCol={setOpenFilterCol}
              />

              {/* Account */}
              <FilterableSortHeader
                label="Account"
                field="account"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
                filterCol="accountName"
                openFilterCol={openFilterCol}
                setOpenFilterCol={setOpenFilterCol}
                filterValue={filters.accountName ?? ''}
                onFilterChange={(v) => setFilters((f) => ({ ...f, accountName: v }))}
                filterType="select"
                filterOptions={accountOptions}
                sortable={false}
              />

              {/* Description */}
              <FilterableSortHeader
                label="Description"
                field="description"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
                filterCol="description"
                openFilterCol={openFilterCol}
                setOpenFilterCol={setOpenFilterCol}
                filterValue={filters.description ?? ''}
                onFilterChange={(v) => setFilters((f) => ({ ...f, description: v }))}
                filterType="text"
              />

              {/* Amount */}
              <FilterableSortHeader
                label="Amount"
                field="amount"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
                filterCol="amount"
                openFilterCol={openFilterCol}
                setOpenFilterCol={setOpenFilterCol}
                filterValue={filters.amountMin ?? ''}
                filterValue2={filters.amountMax ?? ''}
                onFilterChange={(v) => setFilters((f) => ({ ...f, amountMin: v }))}
                onFilterChange2={(v) => setFilters((f) => ({ ...f, amountMax: v }))}
                filterType="amount-range"
                className="text-right"
              />

              {/* Currency */}
              <th className="px-3 py-1 text-left font-medium whitespace-nowrap">Currency</th>

              {/* Payee */}
              <FilterableSortHeader
                label="Payee"
                field="payee"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
                filterCol="payeeName"
                openFilterCol={openFilterCol}
                setOpenFilterCol={setOpenFilterCol}
                filterValue={filters.payeeName ?? ''}
                onFilterChange={(v) => setFilters((f) => ({ ...f, payeeName: v }))}
                filterType="text"
                sortable={false}
              />

              {/* Category */}
              <FilterableSortHeader
                label="Category"
                field="category"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
                filterCol="categoryId"
                openFilterCol={openFilterCol}
                setOpenFilterCol={setOpenFilterCol}
                filterValue={filters.categoryId ?? ''}
                onFilterChange={(v) => setFilters((f) => ({ ...f, categoryId: v }))}
                filterType="optgroup-select"
                filterGroups={categoryGroups}
              />

              {/* Category group */}
              <FilterableSortHeader
                label="Group"
                field="category"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
                filterCol="categoryGroupId"
                openFilterCol={openFilterCol}
                setOpenFilterCol={setOpenFilterCol}
                filterValue={filters.categoryGroupId ?? ''}
                onFilterChange={(v) => setFilters((f) => ({ ...f, categoryGroupId: v }))}
                filterType="select"
                filterOptions={categoryGroups.map((g) => ({ value: g.id, label: g.name }))}
                sortable={false}
              />

              {/* Notes */}
              <FilterableSortHeader
                label="Notes"
                field="notes"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
                filterCol="notes"
                openFilterCol={openFilterCol}
                setOpenFilterCol={setOpenFilterCol}
                filterValue={filters.notes ?? ''}
                onFilterChange={(v) => setFilters((f) => ({ ...f, notes: v }))}
                filterType="text"
                sortable={false}
              />

              {/* Workspace */}
              <FilterableSortHeader
                label="Workspace"
                field="project"
                sortBy={sortBy}
                sortDir={sortDir}
                onSort={handleSort}
                filterCol="projectId"
                openFilterCol={openFilterCol}
                setOpenFilterCol={setOpenFilterCol}
                filterValue={filters.projectId ?? ''}
                onFilterChange={(v) => setFilters((f) => ({ ...f, projectId: v }))}
                filterType="select"
                filterOptions={projects.map((p) => ({ value: p.id, label: p.name }))}
                sortable={false}
              />
              {/* Done button column spacer */}
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {/* ── New row ─────────────────────────────────────────────── */}
            {addingRow && (
              <tr className="border-t bg-blue-50/60" data-testid="new-transaction-row">
                <td className="px-3 py-1 w-8" />
                {/* Date */}
                <td className="px-3 py-1 min-w-[130px]">
                  <input
                    type="date"
                    value={newRow.date}
                    onChange={(e) => setNewRow((r) => ({ ...r, date: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNewRow(); if (e.key === 'Escape') handleCancelNewRow() }}
                    className="w-full rounded border border-blue-400 bg-white px-1 py-0 text-xs outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </td>
                {/* Account */}
                <td className="px-3 py-1 min-w-[120px]">
                  <select
                    value={newRow.accountId}
                    onChange={(e) => setNewRow((r) => ({ ...r, accountId: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Escape') handleCancelNewRow() }}
                    className="w-full rounded border border-blue-400 bg-white px-1 py-0 text-xs outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    <option value="">— Select —</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </td>
                {/* Description */}
                <td className="px-3 py-1 min-w-[160px]">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Description"
                    value={newRow.description}
                    onChange={(e) => setNewRow((r) => ({ ...r, description: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNewRow(); if (e.key === 'Escape') handleCancelNewRow() }}
                    className="w-full rounded border border-blue-400 bg-white px-1 py-0 text-xs outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </td>
                {/* Amount */}
                <td className="px-3 py-1 min-w-[90px]">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={newRow.amount}
                    onChange={(e) => setNewRow((r) => ({ ...r, amount: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNewRow(); if (e.key === 'Escape') handleCancelNewRow() }}
                    className="w-full rounded border border-blue-400 bg-white px-1 py-0 text-xs outline-none focus:ring-1 focus:ring-blue-400 text-right font-mono"
                  />
                </td>
                {/* Currency — derived from account, not editable */}
                <td className="px-3 py-1 text-xs text-muted-foreground">—</td>

                {/* Payee */}
                <td className="px-3 py-1 min-w-[140px]">
                  <PayeeCell
                    value={newRow.payeeId || null}
                    payees={payees}
                    onCommit={(v) => setNewRow((r) => ({ ...r, payeeId: v ?? '' }))}
                    onCancel={() => {}}
                    onNewPayee={(p) => {
                      setPayees((prev) => [...prev, p].sort((a, b) => a.name.localeCompare(b.name)))
                      setNewRow((r) => ({ ...r, payeeId: p.id }))
                    }}
                  />
                </td>
                {/* Category */}
                <td className="px-3 py-1 min-w-[160px]">
                  <CategoryCell
                    value={newRow.categoryId || null}
                    groups={categoryGroups}
                    description={newRow.description}
                    payeeName={payees.find((p) => p.id === newRow.payeeId)?.name ?? null}
                    amount={parseFloat(newRow.amount) || 0}
                    onCommit={(v) => setNewRow((r) => ({ ...r, categoryId: v ?? '' }))}
                    onCancel={() => {}}
                  />
                </td>
                {/* Group — auto-derived */}
                <td className="px-3 py-1 text-xs text-muted-foreground whitespace-nowrap">
                  {newRow.categoryId
                    ? (categoryGroups.find((g) => g.categories.some((c) => c.id === newRow.categoryId))?.name ?? '—')
                    : '—'}
                </td>
                {/* Notes */}
                <td className="px-3 py-1 min-w-[120px]">
                  <input
                    type="text"
                    placeholder="Notes"
                    value={newRow.notes}
                    onChange={(e) => setNewRow((r) => ({ ...r, notes: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveNewRow(); if (e.key === 'Escape') handleCancelNewRow() }}
                    className="w-full rounded border border-blue-400 bg-white px-1 py-0 text-xs outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </td>
                {/* Workspace */}
                <td className="px-3 py-1 min-w-[120px]">
                  <WorkspaceCell
                    value={newRow.projectId || null}
                    projects={projects}
                    onCommit={(v) => setNewRow((r) => ({ ...r, projectId: v ?? '' }))}
                    onCancel={() => {}}
                  />
                </td>
                {/* Save / Cancel */}
                <td className="px-3 py-1 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleSaveNewRow}
                      disabled={savingNew}
                      className="rounded bg-[#534AB7] px-2 py-0.5 text-[10px] text-white hover:bg-[#4338CA] disabled:opacity-50 transition-colors"
                      data-testid="new-row-save-btn"
                    >
                      {savingNew ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={handleCancelNewRow}
                      className="text-muted-foreground hover:text-foreground text-xs leading-none px-0.5"
                      aria-label="Cancel new row"
                      data-testid="new-row-cancel-btn"
                    >
                      ×
                    </button>
                  </div>
                  {newRowError && (
                    <p className="text-[10px] text-red-600 mt-0.5 max-w-[200px]">{newRowError}</p>
                  )}
                </td>
              </tr>
            )}

            {loading && localRows.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-4 py-8 text-center text-muted-foreground" aria-live="polite">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    Loading from database…
                  </span>
                </td>
              </tr>
            ) : !loading && localRows.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">No transactions found.</td>
              </tr>
            ) : (
              localRows.map((row) => {
                const isDeleting = deletingIds.has(row.id)
                const isSelected = selectedIds.has(row.id)
                const isRowEditing = editingRowId === row.id

                return (
                  <React.Fragment key={row.id}>
                  <tr
                    data-row-id={row.id}
                    className={[
                      'border-t transition-colors',
                      isDeleting ? 'opacity-50 bg-red-50'
                        : isRowEditing ? 'bg-indigo-50/60 ring-1 ring-inset ring-indigo-200'
                        : isSelected ? 'bg-blue-50'
                        : selectMode ? 'hover:bg-blue-50/50 cursor-pointer'
                        : 'hover:bg-muted/40',
                    ].filter(Boolean).join(' ')}
                    data-testid="transaction-row"
                    onClick={selectMode ? () => toggleRow(row.id) : undefined}
                    onKeyDown={isRowEditing ? (e) => { if (e.key === 'Enter') exitRowEdit(row.id) } : undefined}
                  >
                    {/* Checkbox — only shown in select mode */}
                    <td className="px-3 py-0.5 w-8" onClick={(e) => e.stopPropagation()}>
                      {selectMode && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(row.id)}
                          aria-label={`Select row ${row.id}`}
                          className="cursor-pointer"
                        />
                      )}
                    </td>

                    {renderEditableCell(row, 'date')}

                    <td className="px-3 py-0.5 text-muted-foreground whitespace-nowrap">{row.account.name}</td>
                    {renderEditableCell(row, 'description')}
                    {renderEditableCell(row, 'amount')}
                    <td className="px-3 py-0.5 text-xs text-muted-foreground whitespace-nowrap">{row.account.currency ?? '—'}</td>
                    {renderEditableCell(row, 'payeeId')}
                    {renderEditableCell(row, 'categoryId')}
                    <td className="px-3 py-0.5 text-xs text-muted-foreground whitespace-nowrap">
                      {row.categoryRef?.group?.name ?? '—'}
                    </td>
                    {renderEditableCell(row, 'notes')}
                    {renderEditableCell(row, 'projectId')}
                    {isRowEditing ? (
                      <td className="px-2 py-0.5 whitespace-nowrap">
                        <button
                          onMouseDown={(e) => { e.preventDefault(); exitRowEdit(row.id) }}
                          className="text-xs px-2 py-0.5 rounded bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors"
                        >
                          Done
                        </button>
                      </td>
                    ) : makeRuleSnap && lastEditedRowId === row.id && !showMakeRuleEditor ? (
                      <td className="px-2 py-0.5 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span className="text-[11px]">💡</span>
                          <button
                            onClick={() => setShowMakeRuleEditor(true)}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-[#534AB7] text-white font-medium hover:bg-[#4338CA] transition-colors whitespace-nowrap"
                          >
                            Make rule
                          </button>
                          <button
                            onClick={() => { setMakeRuleSnap(null) }}
                            className="text-muted-foreground hover:text-foreground leading-none text-[11px] px-0.5"
                            aria-label="Dismiss"
                          >✕</button>
                        </div>
                      </td>
                    ) : (
                      <td />
                    )}
                  </tr>
                  {/* Rule editor sub-row — appears below the edited row */}
                  {makeRuleSnap && lastEditedRowId === row.id && showMakeRuleEditor && (
                    <tr className="border-t border-[#534AB7]/15 bg-[#EEEDFE]/20">
                      <td colSpan={13} className="px-4 py-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[11px]">💡</span>
                          <span className="text-xs font-medium text-[#3C3489]">New rule from this change</span>
                          <button
                            onClick={() => { setMakeRuleSnap(null); setShowMakeRuleEditor(false) }}
                            className="ml-auto text-muted-foreground hover:text-foreground leading-none text-sm"
                            aria-label="Dismiss"
                          >✕</button>
                        </div>
                        <RuleEditor
                          projects={projects}
                          payees={payees}
                          accounts={accounts}
                          categoryGroups={categoryGroups}
                          editingRule={{
                            id: '',
                            name: '',
                            priority: 50,
                            categoryName: makeRuleSnap.categoryName ?? '',
                            categoryId: makeRuleSnap.categoryId ?? null,
                            categoryRef: null,
                            payeeId: null,
                            payee: makeRuleSnap.payeeName ? { id: '', name: makeRuleSnap.payeeName } : null,
                            projectId: null,
                            workspace: null,
                            conditions: { all: [{ field: 'description', operator: 'contains', value: makeRuleSnap.description }] },
                            isActive: true,
                          }}
                          onSave={() => { setMakeRuleSnap(null); setShowMakeRuleEditor(false) }}
                          onCancel={() => { setMakeRuleSnap(null); setShowMakeRuleEditor(false) }}
                          showSaveAndApply={true}
                        />
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center gap-3 justify-end text-sm" aria-label="Pagination">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded border px-3 py-1 disabled:opacity-40"
            aria-label="Previous page"
            data-testid="prev-page-btn"
          >
            ← Prev
          </button>
          <span>Page {page} of {Math.ceil(total / pageSize)}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= Math.ceil(total / pageSize)}
            className="rounded border px-3 py-1 disabled:opacity-40"
            aria-label="Next page"
            data-testid="next-page-btn"
          >
            Next →
          </button>
        </div>
      )}

      {/* ── New rule modal ─────────────────────────────────────────── */}
      {showNewRuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowNewRuleModal(false)}>
          <div className="w-full max-w-2xl rounded-xl border border-[#534AB7]/25 bg-white shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#534AB7]/10 bg-[#EEEDFE]/30">
              <span className="text-[13px]">✦</span>
              <span className="text-xs font-medium text-[#3C3489] flex-1">New rule</span>
              <button onClick={() => setShowNewRuleModal(false)} className="text-muted-foreground hover:text-foreground leading-none">✕</button>
            </div>
            <div className="p-4">
              <RuleEditor
                projects={projects}
                payees={payees}
                accounts={accounts}
                categoryGroups={categoryGroups}
                editingRule={undefined}
                onSave={() => setShowNewRuleModal(false)}
                onCancel={() => setShowNewRuleModal(false)}
                showSaveAndApply={true}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Rules agent modal ──────────────────────────────────────── */}
      {showAgentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAgentModal(false)}>
          <div className="w-full max-w-2xl rounded-xl border border-[#534AB7]/25 bg-white shadow-xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#534AB7]/10 bg-[#EEEDFE]/30 shrink-0">
              <span className="text-[13px]">✦</span>
              <span className="text-xs font-medium text-[#3C3489] flex-1">Rules agent</span>
              <button onClick={() => setShowAgentModal(false)} className="text-muted-foreground hover:text-foreground leading-none">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <RulesAgent
                categoryGroups={categoryGroups}
                payees={payees}
                projects={projects}
                accounts={accounts}
                onRuleAccepted={() => {}}
                onClose={() => setShowAgentModal(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
