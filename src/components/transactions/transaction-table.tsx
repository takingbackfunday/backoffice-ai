'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Project } from '@prisma/client'
import type { TransactionWithRelations } from '@/types'
import { type CategoryGroup, type Payee } from '@/components/rules/rule-editor'

interface Props {
  initialRows?: TransactionWithRelations[]
  initialTotal?: number
  initialProjects?: Project[]
  initialCategoryGroups?: CategoryGroup[]
  initialPayees?: Payee[]
}

type SortField = 'date' | 'amount' | 'description' | 'category'
type SortDir = 'asc' | 'desc'
type EditableField = 'description' | 'category' | 'categoryId' | 'payeeId' | 'notes' | 'projectId' | 'amount' | 'date'

interface EditingCell {
  id: string
  field: EditableField
}

// ── Inline text input ──────────────────────────────────────────────
function TextCell({
  value,
  onCommit,
  onCancel,
  type = 'text',
}: {
  value: string
  onCommit: (v: string) => void
  onCancel: () => void
  type?: 'text' | 'number' | 'date'
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(value)

  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])

  return (
    <input
      ref={ref}
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(draft)
        if (e.key === 'Escape') onCancel()
      }}
      onBlur={() => onCommit(draft)}
      className="w-full rounded border border-blue-400 bg-white px-1 py-0 text-sm outline-none focus:ring-1 focus:ring-blue-400"
      aria-label="Edit cell value"
    />
  )
}

// ── Inline project select ──────────────────────────────────────────
function ProjectCell({
  value,
  projects,
  onCommit,
  onCancel,
}: {
  value: string | null
  projects: Project[]
  onCommit: (v: string | null) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLSelectElement>(null)

  useEffect(() => { ref.current?.focus() }, [])

  return (
    <select
      ref={ref}
      defaultValue={value ?? ''}
      onChange={(e) => onCommit(e.target.value || null)}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
      onBlur={() => onCancel()}
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

// ── Inline category select ────────────────────────────────────────
function CategoryCell({
  value,
  groups,
  onCommit,
  onCancel,
}: {
  value: string | null
  groups: CategoryGroup[]
  onCommit: (id: string | null) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLSelectElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <select
      ref={ref}
      defaultValue={value ?? ''}
      onChange={(e) => onCommit(e.target.value || null)}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
      onBlur={() => onCancel()}
      className="w-full rounded border border-blue-400 bg-white px-1 py-0 text-sm outline-none focus:ring-1 focus:ring-blue-400"
      aria-label="Select category"
    >
      <option value="">— None —</option>
      {groups.map((g) => (
        <optgroup key={g.id} label={g.name}>
          {g.categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

// ── Floating toast: rule suggestions ready ────────────────────────
function SuggestionToast({ onDismiss }: { onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 8000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-[#534AB7]/20 bg-white shadow-lg px-4 py-3 text-xs text-[#3C3489] max-w-xs">
      <span className="text-base">💡</span>
      <div className="flex-1 min-w-0">
        <p className="font-medium leading-tight">Rule suggestions ready</p>
        <p className="text-[#534AB7]/70 mt-0.5 leading-tight">Based on your recent edits.</p>
      </div>
      <a
        href="/rules"
        className="shrink-0 rounded-md bg-[#534AB7] px-2.5 py-1 text-white font-medium hover:bg-[#4338CA] transition-colors"
      >
        View
      </a>
      <button
        onClick={onDismiss}
        className="shrink-0 text-[#534AB7]/50 hover:text-[#534AB7] leading-none"
        aria-label="Dismiss"
      >✕</button>
    </div>
  )
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
      // onNewPayee adds to state AND commits the transaction in one shot,
      // so we skip the separate onCommit call to avoid a double-patch.
      onNewPayee(newPayee)
    } catch {
      setCreating(false)
    }
  }

  function pickExisting(p: Payee) {
    onCommit(p.id)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onCancel(); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      const exact = payees.find((p) => p.name.toLowerCase() === draft.trim().toLowerCase())
      if (exact) { onCommit(exact.id); return }
      if (filtered.length === 1) { onCommit(filtered[0].id); return }
      if (showCreate) createAndCommit()
    }
  }

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        // Commit best match or cancel
        const exact = payees.find((p) => p.name.toLowerCase() === draft.trim().toLowerCase())
        if (exact) onCommit(exact.id)
        else if (draft.trim() === '') onCommit(null)
        else onCancel()
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
      {open && (filtered.length > 0 || showCreate) && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-0.5 w-full rounded border border-black/10 bg-white shadow-md text-[10px] max-h-44 overflow-y-auto"
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
      )}
    </div>
  )
}

// ── Sortable header cell ───────────────────────────────────────────
function SortHeader({
  label,
  field,
  sortBy,
  sortDir,
  onSort,
  className = '',
}: {
  label: string
  field: SortField
  sortBy: SortField
  sortDir: SortDir
  onSort: (f: SortField) => void
  className?: string
}) {
  const active = sortBy === field
  return (
    <th
      className={`px-3 py-1 text-left font-medium cursor-pointer select-none whitespace-nowrap hover:bg-muted/80 ${className}`}
      onClick={() => onSort(field)}
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      {active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
    </th>
  )
}

// ── Main component ─────────────────────────────────────────────────
export function TransactionTable({ initialRows, initialTotal, initialProjects, initialCategoryGroups, initialPayees }: Props) {
  const [localRows, setLocalRows] = useState<TransactionWithRelations[]>(initialRows ?? [])
  const [total, setTotal] = useState(initialTotal ?? 0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(!initialRows)

  // Date filter
  type DatePreset = 'this-month' | 'last-month' | 'last-3-months' | 'last-6-months' | 'ytd'
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const datePickerRef = useRef<HTMLDivElement>(null)

  // Close date picker on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setShowDatePicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function applyPreset(preset: DatePreset) {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    let from: Date
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0) // end of current month
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
    setShowDatePicker(false)
  }

  function applyCustomDates() {
    if (!customFrom && !customTo) return
    setDateFrom(customFrom)
    setDateTo(customTo)
    setPage(1)
    setShowDatePicker(false)
  }

  function clearDateFilter() {
    setDateFrom('')
    setDateTo('')
    setCustomFrom('')
    setCustomTo('')
    setPage(1)
  }

  function dateFilterLabel() {
    if (!dateFrom && !dateTo) return null
    const fmt = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    if (dateFrom && dateTo) return `${fmt(dateFrom)} – ${fmt(dateTo)}`
    if (dateFrom) return `From ${fmt(dateFrom)}`
    return `Until ${fmt(dateTo)}`
  }

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [search])
  const [error, setError] = useState<string | null>(null)

  const [sortBy, setSortBy] = useState<SortField>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [errorIds, setErrorIds] = useState<Set<string>>(new Set())

  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkDeletedCount, setBulkDeletedCount] = useState(0)

  const [projects, setProjects] = useState<Project[]>(initialProjects ?? [])
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>(initialCategoryGroups ?? [])
  const [payees, setPayees] = useState<Payee[]>(initialPayees ?? [])

  // ── Edit queue for deferred rule suggestions ──────────────────────
  // Maps txn id → latest row snapshot after a successful edit
  const editQueueRef = useRef<Map<string, TransactionWithRelations>>(new Map())
  const suggestionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [suggestionReady, setSuggestionReady] = useState(false)

  const pageSize = 200

  // Load projects, categories, payees once (skip if passed from server)
  useEffect(() => {
    if (initialProjects && initialCategoryGroups && initialPayees) return
    if (!initialProjects) fetch('/api/projects').then((r) => r.json()).then((j) => { if (!j.error) setProjects(j.data ?? []) }).catch(() => {})
    if (!initialCategoryGroups) fetch('/api/category-groups').then((r) => r.json()).then((j) => { if (!j.error) setCategoryGroups(j.data ?? []) }).catch(() => {})
    if (!initialPayees) fetch('/api/payees').then((r) => r.json()).then((j) => { if (!j.error) setPayees(j.data ?? []) }).catch(() => {})
  }, [initialProjects, initialCategoryGroups, initialPayees])

  // Track whether this is the very first render with server data
  const isFirstRender = useRef(true)

  // Fetch transactions
  const fetchTransactions = useCallback(() => {
    // Skip the initial fetch if we have server-provided data and nothing has changed
    if (isFirstRender.current && initialRows && page === 1 && debouncedSearch === '' && sortBy === 'date' && sortDir === 'desc' && !dateFrom && !dateTo) {
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
  }, [page, pageSize, debouncedSearch, sortBy, sortDir, dateFrom, dateTo])

  useEffect(() => {
    return fetchTransactions()
  }, [fetchTransactions])

  // ── Sorting ──────────────────────────────────────────────────────
  function handleSort(field: SortField) {
    if (sortBy === field) {
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortBy('date'); setSortDir('desc') }
    } else {
      setSortBy(field)
      setSortDir('asc')
    }
    setPage(1)
  }

  // ── Inline edit ──────────────────────────────────────────────────
  function startEdit(id: string, field: EditableField) {
    if (savingIds.has(id) || deletingIds.has(id)) return
    setEditingCell({ id, field })
  }

  async function commitEdit(id: string, field: EditableField, rawValue: string | null, freshPayee?: Payee) {
    setEditingCell(null)

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
          const project = projects.find((p) => p.id === rawValue) ?? null
          return { ...r, projectId: rawValue, project }
        }
        if (field === 'categoryId') {
          const allCats = categoryGroups.flatMap((g) => g.categories)
          const cat = allCats.find((c) => c.id === rawValue)
          const group = categoryGroups.find((g) => g.categories.some((c) => c.id === rawValue))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const categoryRef = cat && group ? { ...cat, group } as any : null
          return { ...r, categoryId: rawValue, categoryRef }
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
      // For categoryId, also send the category string for backward compat
      const patchBody: Record<string, unknown> = { [field]: patchValue }
      if (field === 'categoryId' && rawValue) {
        const allCats = categoryGroups.flatMap((g) => g.categories)
        const cat = allCats.find((c) => c.id === rawValue)
        if (cat) patchBody.category = cat.name
      }

      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      })
      if (!res.ok) throw new Error('patch failed')

      // Queue this edit for deferred rule suggestion generation.
      // Build the edit snapshot from patchBody + existing row so we capture
      // the values that were actually saved, not the pre-patch state.
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

      const editSnapshot = {
        id: row.id,
        description: field === 'description' ? (rawValue ?? row.description) : row.description,
        payeeName: resolvedPayeeName,
        categoryId: field === 'categoryId' ? rawValue : (row.categoryId ?? null),
        categoryName: resolvedCatName,
        amount: Number(row.amount),
      }
      // Merge into existing snapshot so multiple edits to the same row accumulate
      const existing = editQueueRef.current.get(id) as unknown as typeof editSnapshot | undefined
      const merged = existing ? { ...existing, ...editSnapshot } : editSnapshot
      editQueueRef.current.set(id, merged as unknown as TransactionWithRelations)

      // Reset 30-second debounce — no UI shown until suggestions are actually ready
      if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current)
      setSuggestionReady(false)
      suggestionTimerRef.current = setTimeout(() => {
        const queue = editQueueRef.current
        if (queue.size === 0) return
        const snapshots = Array.from(queue.values()) as unknown as typeof editSnapshot[]
        editQueueRef.current = new Map()

        console.log('[suggest-from-edits] firing for', snapshots.length, 'edits', snapshots)

        fetch('/api/rules/suggest-from-edits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ edits: snapshots }),
        })
          .then((r) => r.json())
          .then((j) => {
            console.log('[suggest-from-edits] response:', j)
            if (!j.error && j.data?.count > 0) setSuggestionReady(true)
          })
          .catch((e) => console.error('[suggest-from-edits] fetch error:', e))
      }, 30000)
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

  function cancelEdit() {
    setEditingCell(null)
  }

  // ── Bulk delete ───────────────────────────────────────────────────
  async function confirmBulkDelete() {
    setBulkDeleteConfirm(false)
    setBulkDeleting(true)
    setBulkDeletedCount(0)
    const ids = Array.from(selectedIds)
    ids.forEach((id) => setDeletingIds((s) => new Set(s).add(id)))

    let deleted = 0
    await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/transactions/${id}`, { method: 'DELETE' }).then((r) => {
          if (!r.ok) throw new Error('failed')
          // Remove each row as soon as it's deleted
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
    const isEditing = editingCell?.id === row.id && editingCell.field === field
    const isSaving = savingIds.has(row.id)
    const hasError = errorIds.has(row.id)

    let displayValue: string
    if (field === 'projectId') {
      displayValue = row.project?.name ?? '—'
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
            <ProjectCell
              value={row.projectId ?? null}
              projects={projects}
              onCommit={(v) => commitEdit(row.id, 'projectId', v)}
              onCancel={cancelEdit}
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
              onCommit={(v) => commitEdit(row.id, 'categoryId', v)}
              onCancel={cancelEdit}
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
              onCancel={cancelEdit}
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
              onCommit={(v) => commitEdit(row.id, 'date', v)}
              onCancel={cancelEdit}
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
            onCommit={(v) => commitEdit(row.id, field, v)}
            onCancel={cancelEdit}
          />
        </td>
      )
    }

    return (
      <td
        key={field}
        className={cellClass}
        onClick={() => startEdit(row.id, field)}
        title="Click to edit"
        data-testid={`cell-${field}`}
      >
        {field === 'categoryId' ? (
          <span className={displayValue !== '—' ? 'text-[10px] rounded-full bg-blue-100 text-blue-700 px-1.5 py-px max-w-[120px] truncate block' : ''}>
            {displayValue}
          </span>
        ) : (
          <span className={field === 'notes' || field === 'description' ? 'max-w-[180px] truncate block' : ''}>
            {displayValue}
          </span>
        )}
      </td>
    )
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-3" data-testid="transaction-table">
      {/* Search bar + actions */}
      <div className="flex items-center gap-2">
        <p className="text-xs text-muted-foreground mr-auto">
          {loading && total === 0 ? 'Loading transactions…' : `${total} transaction${total !== 1 ? 's' : ''}`}
        </p>
        {(someChecked || bulkDeleting) && (
          <div className="flex items-center gap-2 text-xs" role="toolbar" aria-label="Bulk actions" data-testid="bulk-toolbar">
            {bulkDeleting ? (
              <>
                <span className="inline-block w-3 h-3 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
                <span className="text-muted-foreground">Deleting {bulkDeletedCount} of {bulkDeletedCount + deletingIds.size}…</span>
              </>
            ) : (
              <>
                <span className="text-muted-foreground">{selectedIds.size} selected</span>
                {bulkDeleteConfirm ? (
                  <>
                    <span className="text-red-600 font-medium">Delete {selectedIds.size} rows?</span>
                    <button onClick={confirmBulkDelete} className="rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700" aria-label="Confirm bulk delete" data-testid="bulk-delete-confirm-btn">Confirm</button>
                    <button onClick={() => setBulkDeleteConfirm(false)} className="rounded border px-2 py-1 hover:bg-muted" aria-label="Cancel bulk delete">Cancel</button>
                  </>
                ) : (
                  <button onClick={() => setBulkDeleteConfirm(true)} className="rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700" aria-label="Delete selected" data-testid="bulk-delete-btn">Delete selected</button>
                )}
                <button onClick={() => { setSelectedIds(new Set()); setBulkDeleteConfirm(false) }} className="text-muted-foreground hover:text-foreground px-1" aria-label="Clear selection">✕</button>
              </>
            )}
          </div>
        )}
        {/* Active date filter chip */}
        {dateFilterLabel() && (
          <span className="flex items-center gap-1 text-xs bg-[#EEEDFE] text-[#3C3489] border border-[#534AB7]/20 rounded-full px-2.5 py-1">
            <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {dateFilterLabel()}
            <button onClick={clearDateFilter} className="ml-0.5 hover:opacity-70" aria-label="Clear date filter">✕</button>
          </span>
        )}

        {/* Date filter button + dropdown */}
        <div ref={datePickerRef} className="relative">
          <button
            onClick={() => setShowDatePicker((v) => !v)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
              dateFrom || dateTo
                ? 'border-[#534AB7]/40 bg-[#EEEDFE] text-[#3C3489]'
                : 'border-black/10 text-muted-foreground hover:text-foreground'
            }`}
            aria-label="Filter by date"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Date
          </button>

          {showDatePicker && (
            <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-black/10 rounded-lg shadow-lg w-56 p-3 space-y-3">
              {/* Presets */}
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Quick select</p>
                {([
                  ['this-month', 'This month'],
                  ['last-month', 'Last month'],
                  ['last-3-months', 'Last 3 months'],
                  ['last-6-months', 'Last 6 months'],
                  ['ytd', 'Year to date'],
                ] as const).map(([preset, label]) => (
                  <button
                    key={preset}
                    onClick={() => applyPreset(preset)}
                    className="w-full text-left text-xs px-2 py-1.5 rounded-md hover:bg-muted/60 transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Custom range */}
              <div className="border-t border-black/5 pt-3 space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Custom range</p>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full text-xs border border-black/15 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#534AB7]/30"
                  placeholder="From"
                />
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full text-xs border border-black/15 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#534AB7]/30"
                  placeholder="To"
                />
                <button
                  onClick={applyCustomDates}
                  disabled={!customFrom && !customTo}
                  className="w-full text-xs py-1.5 rounded-md bg-[#3C3489] text-[#EEEDFE] hover:bg-[#2d2770] disabled:opacity-40 transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <input
            type="search"
            placeholder="Search transactions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-md border px-3 py-1.5 text-xs w-56 pr-7"
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
      </div>

      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

      {/* Rule suggestion floating toast — fixed bottom-right, auto-dismisses */}
      {suggestionReady && (
        <SuggestionToast onDismiss={() => setSuggestionReady(false)} />
      )}

      {/* Table */}
      <div className="overflow-auto rounded-lg border">
        <table className="w-full text-[11px]" aria-label="Transactions">
          <thead className="bg-muted text-[10px] uppercase tracking-wide">
            <tr>
              {/* Checkbox */}
              <th className="px-3 py-1 w-8">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked }}
                  onChange={toggleAll}
                  aria-label="Select all rows"
                  data-testid="select-all-checkbox"
                  className="cursor-pointer"
                />
              </th>
              <SortHeader label="Date" field="date" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <th className="px-3 py-1 text-left font-medium">Account</th>
              <SortHeader label="Description" field="description" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <SortHeader label="Amount" field="amount" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="text-right" />
              <th className="px-3 py-1 text-left font-medium">Payee</th>
              <th className="px-3 py-1 text-left font-medium">Notes</th>
              <th className="px-3 py-1 text-left font-medium">Category</th>
              <th className="px-3 py-1 text-left font-medium">Project</th>
            </tr>
          </thead>
          <tbody>
            {loading && localRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground" aria-live="polite">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    Loading from database…
                  </span>
                </td>
              </tr>
            ) : !loading && localRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No transactions found.</td>
              </tr>
            ) : (
              localRows.map((row) => {
                const isDeleting = deletingIds.has(row.id)
                const isSelected = selectedIds.has(row.id)

                return (
                  <tr
                    key={row.id}
                    className={[
                      'border-t transition-colors',
                      isDeleting ? 'opacity-50 bg-red-50' : isSelected ? 'bg-blue-50' : 'hover:bg-muted/40',
                    ].filter(Boolean).join(' ')}
                    data-testid="transaction-row"
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-0.5 w-8">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(row.id)}
                        aria-label={`Select row ${row.id}`}
                        className="cursor-pointer"
                      />
                    </td>

                    {renderEditableCell(row, 'date')}

                    <td className="px-3 py-0.5 text-muted-foreground whitespace-nowrap">{row.account.name}</td>
                    {renderEditableCell(row, 'description')}
                    {renderEditableCell(row, 'amount')}
                    {renderEditableCell(row, 'payeeId')}
                    {renderEditableCell(row, 'notes')}
                    {renderEditableCell(row, 'categoryId')}
                    {renderEditableCell(row, 'projectId')}
                  </tr>
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
    </div>
  )
}
