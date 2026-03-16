'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Project } from '@prisma/client'
import type { TransactionWithRelations } from '@/types'

interface Props {
  userId: string
  initialRows?: TransactionWithRelations[]
  initialTotal?: number
  initialProjects?: Project[]
  initialCategoryGroups?: CategoryGroup[]
  initialPayees?: Payee[]
}

type SortField = 'date' | 'amount' | 'description' | 'merchantName' | 'category'
type SortDir = 'asc' | 'desc'
type EditableField = 'description' | 'merchantName' | 'category' | 'categoryId' | 'payeeId' | 'notes' | 'projectId' | 'amount'

interface CategoryGroup {
  id: string
  name: string
  categories: { id: string; name: string }[]
}

interface Payee {
  id: string
  name: string
}

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
  type?: 'text' | 'number'
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

// ── Inline payee select ────────────────────────────────────────────
function PayeeCell({
  value,
  payees,
  onCommit,
  onCancel,
}: {
  value: string | null
  payees: Payee[]
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
      aria-label="Select payee"
    >
      <option value="">— None —</option>
      {payees.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
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
      className={`px-3 py-1.5 text-left font-medium cursor-pointer select-none whitespace-nowrap hover:bg-muted/80 ${className}`}
      onClick={() => onSort(field)}
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      {active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
    </th>
  )
}

// ── Main component ─────────────────────────────────────────────────
export function TransactionTable({ userId: _userId, initialRows, initialTotal, initialProjects, initialCategoryGroups, initialPayees }: Props) {
  const [localRows, setLocalRows] = useState<TransactionWithRelations[]>(initialRows ?? [])
  const [total, setTotal] = useState(initialTotal ?? 0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(!initialRows)
  const [error, setError] = useState<string | null>(null)

  const [sortBy, setSortBy] = useState<SortField>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [errorIds, setErrorIds] = useState<Set<string>>(new Set())

  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)

  const [projects, setProjects] = useState<Project[]>(initialProjects ?? [])
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>(initialCategoryGroups ?? [])
  const [payees, setPayees] = useState<Payee[]>(initialPayees ?? [])

  interface RuleSuggestion {
    categoryName: string
    categoryId: string | null
    payeeName: string | null
    payeeId: string | null
    description: string
    amount: number
    matchCount: number
  }
  const [ruleSuggestion, setRuleSuggestion] = useState<RuleSuggestion | null>(null)
  const [savingRule, setSavingRule] = useState(false)

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
    if (isFirstRender.current && initialRows && page === 1 && search === '' && sortBy === 'date' && sortDir === 'desc') {
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
      ...(search ? { search } : {}),
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
  }, [page, pageSize, search, sortBy, sortDir])

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

  async function commitEdit(id: string, field: EditableField, rawValue: string | null) {
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
          const payee = (payees.find((p) => p.id === rawValue) ?? null) as any
          return { ...r, payeeId: rawValue, payee }
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

      // Auto-rule suggestion: after a successful category edit, check if 3+ transactions match
      if ((field === 'category' || field === 'categoryId') && patchValue) {
        const categoryNameForSuggestion =
          field === 'categoryId'
            ? (categoryGroups.flatMap((g) => g.categories).find((c) => c.id === patchValue)?.name ?? '')
            : String(patchValue)

        if (categoryNameForSuggestion) {
          const payeeName = row.payee?.name?.trim() ?? null
          const conditionDef = payeeName && payeeName.length > 2
            ? { field: 'payeeName', operator: 'contains', value: payeeName.toLowerCase() }
            : { field: 'description', operator: 'contains', value: row.description.split(/\s+/).filter((w) => w.length > 3 && !/^\d+$/.test(w)).slice(0, 3).join(' ').toLowerCase() }

          const matchedCatId = field === 'categoryId' ? (patchValue as string | null) : null

          if (conditionDef.value) {
            fetch('/api/rules/preview', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ conditions: { op: 'and', defs: [conditionDef] } }),
            })
              .then((r) => r.json())
              .then((j) => {
                if (!j.error && (j.meta?.matchCount ?? 0) >= 3) {
                  setRuleSuggestion({
                    categoryName: categoryNameForSuggestion,
                    categoryId: matchedCatId,
                    payeeName,
                    payeeId: row.payeeId ?? null,
                    description: row.description,
                    amount: Number(row.amount),
                    matchCount: j.meta.matchCount,
                  })
                }
              })
              .catch(() => {})
          }
        }
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

  function cancelEdit() {
    setEditingCell(null)
  }

  // ── Rule suggestion ───────────────────────────────────────────────
  async function saveRuleSuggestion() {
    if (!ruleSuggestion) return
    setSavingRule(true)
    try {
      const payeeName = ruleSuggestion.payeeName?.trim()
      const condDefs = [
        { field: 'amount', operator: ruleSuggestion.amount < 0 ? 'lt' : 'gt', value: 0 },
        payeeName && payeeName.length > 2
          ? { field: 'payeeName', operator: 'contains', value: payeeName.toLowerCase() }
          : {
              field: 'description',
              operator: 'contains',
              value: ruleSuggestion.description.split(/\s+/).filter((w) => w.length > 3 && !/^\d+$/.test(w)).slice(0, 3).join(' ').toLowerCase(),
            },
      ].filter((c) => c.value !== '')

      const label = payeeName || ruleSuggestion.description.slice(0, 30)
      const matchedCat = ruleSuggestion.categoryId
        ? categoryGroups.flatMap((g) => g.categories).find((c) => c.id === ruleSuggestion.categoryId)
        : categoryGroups.flatMap((g) => g.categories).find((c) => c.name === ruleSuggestion.categoryName)
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${label} → ${ruleSuggestion.categoryName}`,
          priority: 50,
          conditions: { all: condDefs },
          categoryName: ruleSuggestion.categoryName,
          categoryId: matchedCat?.id ?? null,
          payeeId: ruleSuggestion.payeeId ?? null,
        }),
      })
      if (!res.ok) throw new Error('failed')
      setRuleSuggestion(null)
    } catch {
      // Silently fail — rule suggestion is best-effort
    } finally {
      setSavingRule(false)
    }
  }

  // ── Per-row delete ────────────────────────────────────────────────
  function handleDeleteClick(id: string) {
    if (pendingDeleteId === id) {
      // Confirmed
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
      setPendingDeleteId(null)
      confirmDelete(id)
    } else {
      // First click — start 3s timeout
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
      setPendingDeleteId(id)
      deleteTimerRef.current = setTimeout(() => setPendingDeleteId(null), 3000)
    }
  }

  async function confirmDelete(id: string) {
    setDeletingIds((s) => new Set(s).add(id))
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('delete failed')
      setLocalRows((rows) => rows.filter((r) => r.id !== id))
      setSelectedIds((s) => { const n = new Set(s); n.delete(id); return n })
      setTotal((t) => t - 1)
    } catch {
      setError('Failed to delete transaction')
    } finally {
      setDeletingIds((s) => { const n = new Set(s); n.delete(id); return n })
    }
  }

  // ── Bulk delete ───────────────────────────────────────────────────
  async function confirmBulkDelete() {
    setBulkDeleteConfirm(false)
    const ids = Array.from(selectedIds)
    ids.forEach((id) => setDeletingIds((s) => new Set(s).add(id)))

    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/transactions/${id}`, { method: 'DELETE' }).then((r) => {
          if (!r.ok) throw new Error('failed')
          return id
        })
      )
    )

    const deleted = results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
      .map((r) => r.value)

    setLocalRows((rows) => rows.filter((r) => !deleted.includes(r.id)))
    setSelectedIds(new Set())
    setTotal((t) => t - deleted.length)
    ids.forEach((id) => setDeletingIds((s) => { const n = new Set(s); n.delete(id); return n }))
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
      displayValue = row.payee?.name ?? row.merchantName ?? '—'
    } else if (field === 'amount') {
      const n = Number(row.amount)
      displayValue = (n >= 0 ? '+' : '') + n.toFixed(2)
    } else {
      displayValue = (row[field as keyof TransactionWithRelations] as string | null) ?? '—'
    }

    const cellClass = [
      'px-3 py-1 cursor-pointer',
      isSaving ? 'opacity-50' : '',
      hasError ? 'ring-1 ring-inset ring-red-400 rounded' : '',
      field === 'amount' ? 'text-right font-mono' : '',
      field === 'amount' && Number(row.amount) >= 0 ? 'text-green-600' : '',
      field === 'amount' && Number(row.amount) < 0 ? 'text-red-600' : '',
    ].filter(Boolean).join(' ')

    if (isEditing) {
      if (field === 'projectId') {
        return (
          <td key={field} className="px-3 py-1 min-w-[120px]">
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
          <td key={field} className="px-3 py-1 min-w-[160px]">
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
          <td key={field} className="px-3 py-1 min-w-[140px]">
            <PayeeCell
              value={row.payeeId ?? null}
              payees={payees}
              onCommit={(v) => commitEdit(row.id, 'payeeId', v)}
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
        <td key={field} className="px-3 py-1 min-w-[100px]">
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
          <span className={displayValue !== '—' ? 'text-xs rounded-full bg-blue-100 text-blue-700 px-2 py-0.5' : ''}>
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
      {/* Search bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading && total === 0 ? 'Loading transactions…' : `${total} transaction${total !== 1 ? 's' : ''}`}
        </p>
        <input
          type="search"
          placeholder="Search transactions…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="rounded-md border px-3 py-1.5 text-sm w-64"
          aria-label="Search transactions by description or merchant"
          data-testid="transaction-search"
        />
      </div>

      {/* Bulk delete toolbar */}
      {someChecked && (
        <div
          className="flex items-center gap-3 rounded-md border bg-muted/60 px-4 py-2 text-sm"
          role="toolbar"
          aria-label="Bulk actions"
          data-testid="bulk-toolbar"
        >
          <span className="font-medium">{selectedIds.size} selected</span>
          {bulkDeleteConfirm ? (
            <>
              <span className="text-red-600 font-medium">Delete {selectedIds.size} rows?</span>
              <button
                onClick={confirmBulkDelete}
                className="rounded bg-red-600 px-3 py-1 text-white hover:bg-red-700"
                aria-label="Confirm bulk delete"
                data-testid="bulk-delete-confirm-btn"
              >
                Confirm
              </button>
              <button
                onClick={() => setBulkDeleteConfirm(false)}
                className="rounded border px-3 py-1 hover:bg-muted"
                aria-label="Cancel bulk delete"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setBulkDeleteConfirm(true)}
              className="rounded bg-red-600 px-3 py-1 text-white hover:bg-red-700"
              aria-label="Delete selected transactions"
              data-testid="bulk-delete-btn"
            >
              Delete selected
            </button>
          )}
          <button
            onClick={() => { setSelectedIds(new Set()); setBulkDeleteConfirm(false) }}
            className="ml-auto text-muted-foreground hover:text-foreground"
            aria-label="Clear selection"
          >
            Clear
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

      {/* Rule suggestion banner */}
      {ruleSuggestion && (
        <div
          className="flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm"
          role="status"
          aria-label="Rule suggestion"
          data-testid="rule-suggestion-banner"
        >
          <span>
            💡 <strong>{ruleSuggestion.matchCount} transactions</strong> match this pattern.
            Save <strong>"{ruleSuggestion.categoryName}"</strong> as a rule?
          </span>
          <button
            onClick={saveRuleSuggestion}
            disabled={savingRule}
            className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700 disabled:opacity-50"
            aria-label="Save as rule"
            data-testid="save-rule-btn"
          >
            {savingRule ? 'Saving…' : 'Save rule'}
          </button>
          <button
            onClick={() => setRuleSuggestion(null)}
            className="ml-auto text-muted-foreground hover:text-foreground"
            aria-label="Dismiss rule suggestion"
            data-testid="dismiss-rule-btn"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-auto rounded-lg border">
        <table className="w-full text-sm" aria-label="Transactions">
          <thead className="bg-muted text-xs uppercase tracking-wide">
            <tr>
              {/* Checkbox */}
              <th className="px-3 py-1.5 w-8">
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
              <SortHeader label="Description" field="description" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <th className="px-3 py-1.5 text-left font-medium">Payee</th>
              <th className="px-3 py-1.5 text-left font-medium">Category</th>
              <th className="px-3 py-1.5 text-left font-medium">Project</th>
              <SortHeader label="Amount" field="amount" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="text-right" />
              <th className="px-3 py-1.5 text-left font-medium">Notes</th>
              <th className="px-3 py-1.5 text-left font-medium w-20">Actions</th>
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
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  No transactions found.
                </td>
              </tr>
            ) : (
              localRows.map((row) => {
                const isPendingDelete = pendingDeleteId === row.id
                const isDeleting = deletingIds.has(row.id)
                const isSelected = selectedIds.has(row.id)

                return (
                  <tr
                    key={row.id}
                    className={[
                      'border-t transition-colors',
                      isPendingDelete || isDeleting ? 'bg-red-50' : isSelected ? 'bg-blue-50' : 'hover:bg-muted/40',
                      isDeleting ? 'opacity-50' : '',
                    ].filter(Boolean).join(' ')}
                    data-testid="transaction-row"
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-1 w-8">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(row.id)}
                        aria-label={`Select row ${row.id}`}
                        className="cursor-pointer"
                      />
                    </td>

                    {/* Date — read-only */}
                    <td className="px-3 py-1 whitespace-nowrap text-muted-foreground">
                      {new Date(row.date).toLocaleDateString()}
                    </td>

                    {/* Editable cells */}
                    {renderEditableCell(row, 'description')}
                    {renderEditableCell(row, 'payeeId')}
                    {renderEditableCell(row, 'categoryId')}
                    {renderEditableCell(row, 'projectId')}
                    {renderEditableCell(row, 'amount')}
                    {renderEditableCell(row, 'notes')}

                    {/* Actions */}
                    <td className="px-3 py-1 w-20">
                      {isPendingDelete ? (
                        <button
                          onClick={() => handleDeleteClick(row.id)}
                          className="text-xs rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700"
                          aria-label="Confirm delete transaction"
                          data-testid="confirm-delete-btn"
                        >
                          Confirm?
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDeleteClick(row.id)}
                          disabled={isDeleting}
                          className="rounded p-1 text-muted-foreground hover:text-red-600 hover:bg-red-50 disabled:opacity-40"
                          aria-label="Delete transaction"
                          data-testid="delete-btn"
                        >
                          🗑
                        </button>
                      )}
                    </td>
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
