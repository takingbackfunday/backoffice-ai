'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

export interface TxForPicker {
  id: string
  date: string
  amount: number
  description: string
  notes: string | null
  category: string | null
  workspace: { id: string; name: string } | null
  categoryRef: { name: string; group: { name: string } } | null
  payee: { name: string } | null
  account: { name: string; currency: string }
}

interface UseFromTransactionsProps {
  projectId: string
}

function normalizeTx(raw: unknown): TxForPicker {
  const t = raw as Record<string, unknown>
  const account = t.account as Record<string, unknown> | undefined
  const workspace = t.workspace as Record<string, unknown> | null | undefined
  const categoryRef = t.categoryRef as Record<string, unknown> | null | undefined
  const group = categoryRef?.group as Record<string, unknown> | undefined
  const payee = t.payee as Record<string, unknown> | null | undefined

  return {
    id: String(t.id),
    date: String(t.date),
    amount: Number.isFinite(Number(t.amount)) ? Number(t.amount) : 0,
    description: String(t.description),
    notes: t.notes ? String(t.notes) : null,
    category: t.category ? String(t.category) : null,
    workspace: workspace ? { id: String(workspace.id), name: String(workspace.name) } : null,
    categoryRef: categoryRef ? { name: String(categoryRef.name), group: { name: String(group?.name) } } : null,
    payee: payee ? { name: String(payee.name) } : null,
    account: {
      name: String(account?.name ?? ''),
      currency: String(account?.currency ?? 'USD'),
    },
  }
}

export function useFromTransactions({ projectId }: UseFromTransactionsProps) {
  const [tab, setTab] = useState<'project' | 'all'>('project')
  const [search, setSearch] = useState('')
  const [transactions, setTransactions] = useState<TxForPicker[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [taggingIds, setTaggingIds] = useState<Set<string>>(new Set())
  const abortRef = useRef<AbortController | null>(null)

  const cancelPending = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const fetchTransactions = useCallback(async (nextTab: 'project' | 'all', nextSearch: string) => {
    if (!projectId) {
      setTransactions([])
      return
    }
    cancelPending()
    setLoading(true)
    setError(null)
    const controller = new AbortController()
    abortRef.current = controller
    const timeout = setTimeout(() => controller.abort(), 10000)

    try {
      const params = new URLSearchParams({
        amountMax: '-0.01',
        pageSize: '100',
        sortBy: 'date',
        sortDir: 'desc',
      })
      if (nextTab === 'project') params.set('projectId', projectId)
      if (nextSearch.trim()) params.set('search', nextSearch.trim())

      const res = await fetch(`/api/transactions?${params.toString()}`, { signal: controller.signal })
      clearTimeout(timeout)
      if (!res.ok) throw new Error('Failed to fetch transactions')

      const json = (await res.json()) as { data: unknown[] }
      setTransactions((json.data ?? []).map(normalizeTx))
    } catch (e) {
      clearTimeout(timeout)
      if ((e as Error | undefined)?.name === 'AbortError') return
      setError(e instanceof Error ? e.message : 'Failed to load transactions')
    } finally {
      if (abortRef.current === controller) {
        setLoading(false)
        abortRef.current = null
      }
    }
  }, [projectId, cancelPending])

  useEffect(() => {
    fetchTransactions(tab, search)
    return () => { cancelPending() }
  }, [tab, search, projectId, fetchTransactions, cancelPending])

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      transactions.forEach(t => next.add(t.id))
      return next
    })
  }, [transactions])

  const deselectAll = useCallback(() => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      transactions.forEach(t => next.delete(t.id))
      return next
    })
  }, [transactions])

  const tagToProject = useCallback(async (id: string) => {
    if (!projectId) return
    setTaggingIds(prev => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: projectId }),
      })
      if (!res.ok) throw new Error('Failed to tag transaction')
      const json = (await res.json()) as { data: unknown }
      const updated = normalizeTx(json.data)
      setTransactions(prev => prev.map(t => (t.id === id ? updated : t)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to tag transaction')
    } finally {
      setTaggingIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }, [projectId])

  const getSelectedTransactions = useCallback(
    () => transactions.filter(t => selectedIds.has(t.id)),
    [transactions, selectedIds]
  )

  return {
    tab,
    setTab,
    search,
    setSearch,
    transactions,
    selectedIds,
    loading,
    error,
    taggingIds,
    fetchTransactions,
    toggleSelection,
    selectAll,
    deselectAll,
    tagToProject,
    getSelectedTransactions,
  }
}
