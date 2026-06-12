'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { TransactionWithRelations } from '@/types'
import type { Payee } from '@/components/rules/rule-editor'
import type { Workspace } from '@/generated/prisma/client'
import { toDisplay } from '@/lib/money'
type EditableField = 'description' | 'category' | 'categoryId' | 'payeeId' | 'notes' | 'projectId' | 'amount' | 'date'

export interface MakeRuleSnapType {
  description: string
  payeeName: string | null
  categoryId: string | null
  categoryName: string | null
}

const SUGGEST_DELAY_MS = 30000

export function useInlineEdit(opts: {
  localRows: TransactionWithRelations[]
  setLocalRows: React.Dispatch<React.SetStateAction<TransactionWithRelations[]>>
  setError: React.Dispatch<React.SetStateAction<string | null>>
  projects: Workspace[]
  categoryGroups: { id: string; name: string; categories: { id: string; name: string }[] }[]
  payees: Payee[]
  setPayees: React.Dispatch<React.SetStateAction<Payee[]>>
  selectMode: boolean
  deletingIds: Set<string>
  setDeletingIds: React.Dispatch<React.SetStateAction<Set<string>>>
}) {
  const { localRows, setLocalRows, setError, projects, categoryGroups, payees, setPayees, selectMode, deletingIds, setDeletingIds } = opts

  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [editingRowInitialField, setEditingRowInitialField] = useState<EditableField | null>(null)
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [errorIds, setErrorIds] = useState<Set<string>>(new Set())

  const editingRowIdRef = useRef(editingRowId)
  useEffect(() => { editingRowIdRef.current = editingRowId }, [editingRowId])

  // Edit queue for deferred rule suggestions
  const editQueueRef = useRef<Map<string, TransactionWithRelations>>(new Map())
  const suggestionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Make-rule state
  const [makeRuleSnap, setMakeRuleSnap] = useState<MakeRuleSnapType | null>(null)
  const [showMakeRuleEditor, setShowMakeRuleEditor] = useState(false)
  const [lastEditedRowId, setLastEditedRowId] = useState<string | null>(null)
  const pendingRuleSnapRef = useRef<{ rowId: string; snap: MakeRuleSnapType } | null>(null)

  // Fire suggestion request (deferred, background)
  const fireSuggestions = useCallback(() => {
    if (suggestionTimerRef.current) { clearTimeout(suggestionTimerRef.current); suggestionTimerRef.current = null }
    const queue = editQueueRef.current
    if (queue.size === 0) return
    const snapshots = Array.from(queue.values())
    editQueueRef.current = new Map()
    fetch('/api/rules/suggest-from-edits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ edits: snapshots }),
    }).catch(() => {})
  }, [])

  const promoteIfLeft = useCallback((fromRowId: string) => {
    const pending = pendingRuleSnapRef.current
    if (!pending || pending.rowId !== fromRowId) return
    if (editingRowIdRef.current === fromRowId) return

    setMakeRuleSnap(null)
    setShowMakeRuleEditor(false)
    requestAnimationFrame(() => {
      setMakeRuleSnap(pending.snap)
      setLastEditedRowId(pending.rowId)
      pendingRuleSnapRef.current = null
    })

    if (editQueueRef.current.size > 0) {
      if (suggestionTimerRef.current) clearTimeout(suggestionTimerRef.current)
      suggestionTimerRef.current = setTimeout(fireSuggestions, SUGGEST_DELAY_MS)
    }
  }, [fireSuggestions])

  function exitRowEdit(id: string) {
    setEditingRowId(null)
    setEditingRowInitialField(null)
    editingRowIdRef.current = null
    promoteIfLeft(id)
  }

  // Handle outside-click via capture (row-scoped data-row-id comparison)
  useEffect(() => {
    if (!editingRowId) return
    const rowId = editingRowId
    function handler(e: MouseEvent) {
      const target = e.target as Element | null
      if (target?.closest('[data-portal-dropdown]')) return
      const clickedRowId = target?.closest('[data-row-id]')?.getAttribute('data-row-id')
      if (clickedRowId !== rowId) {
        exitRowEdit(rowId)
      }
    }
    document.addEventListener('mousedown', handler, true)
    return () => document.removeEventListener('mousedown', handler, true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingRowId])

  function startEdit(id: string, field: EditableField) {
    if (selectMode || savingIds.has(id) || deletingIds.has(id)) return
    setMakeRuleSnap(null)
    setShowMakeRuleEditor(false)
    pendingRuleSnapRef.current = null
    setEditingRowId(id)
    setEditingRowInitialField(field)
  }

  async function commitEdit(id: string, field: EditableField, rawValue: string | null, freshPayee?: Payee) {
    const row = localRows.find((r) => r.id === id)
    if (!row) return

    // Build patch value
    let patchValue: string | number | null = rawValue
    if (field === 'amount') {
      const n = parseFloat(rawValue ?? '')
      if (isNaN(n)) return
      patchValue = n
    }
    if (field === 'date') {
      if (!rawValue) return
      const d = new Date(rawValue)
      if (isNaN(d.getTime())) return
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
          amount: toDisplay(row.amount),
        }
        const existing = editQueueRef.current.get(id) as unknown as typeof editSnapshot | undefined
        const merged = existing ? { ...existing, ...editSnapshot } : editSnapshot
        editQueueRef.current.set(id, merged as unknown as TransactionWithRelations)

        // Stage the popup snap — merge with previous snap for this row
        const prevSnap = pendingRuleSnapRef.current?.rowId === id ? pendingRuleSnapRef.current.snap : null
        pendingRuleSnapRef.current = {
          rowId: id,
          snap: {
            description: row.description,
            payeeName: resolvedPayeeName ?? prevSnap?.payeeName ?? null,
            categoryId: resolvedCatId ?? prevSnap?.categoryId ?? null,
            categoryName: resolvedCatName ?? prevSnap?.categoryName ?? null,
          },
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

  return {
    editingRowId, editingRowInitialField,
    savingIds, errorIds, deletingIds, setDeletingIds,
    makeRuleSnap, setMakeRuleSnap,
    showMakeRuleEditor, setShowMakeRuleEditor,
    lastEditedRowId, setLastEditedRowId,
    startEdit, exitRowEdit, commitEdit,
  }
}
