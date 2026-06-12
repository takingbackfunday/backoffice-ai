'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { TransactionWithRelations } from '@/types'

type SortField = 'date' | 'amount' | 'description' | 'category'
type SortDir = 'asc' | 'desc'

export interface ColumnFilters {
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

type DatePreset = 'this-month' | 'last-month' | 'last-3-months' | 'last-6-months' | 'ytd'

const todayISO = new Date().toISOString().slice(0, 10)

export function useTransactionData(initialProps: {
  initialRows?: TransactionWithRelations[]
  initialTotal?: number
  initialSearch?: string
}) {
  const { initialRows, initialTotal, initialSearch } = initialProps

  const [localRows, setLocalRows] = useState<TransactionWithRelations[]>(initialRows ?? [])
  const [total, setTotal] = useState(initialTotal ?? 0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(!initialRows)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [search, setSearch] = useState(initialSearch ?? '')
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch ?? '')
  const [filters, setFilters] = useState<ColumnFilters>({})
  const [debouncedFilters, setDebouncedFilters] = useState<ColumnFilters>({})
  const [openFilterCol, setOpenFilterCol] = useState<string | null>(null)

  const [sortBy, setSortBy] = useState<SortField>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const pageSize = 200
  const isFirstRender = useRef(true)

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
    setDateFrom(fmt(from!))
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
      })
      .catch((e) => { if (e.name !== 'AbortError') setError('Failed to load transactions') })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [page, pageSize, debouncedSearch, debouncedFilters, sortBy, sortDir, dateFrom, dateTo, initialRows])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => fetchTransactions(), [fetchTransactions, refreshKey])

  const activeFilterCount = Object.values(debouncedFilters).filter(Boolean).length + (debouncedSearch ? 1 : 0) + (dateFrom || dateTo ? 1 : 0)
  const hasActiveFilters = activeFilterCount > 0

  function clearAllFilters() {
    setSearch(''); setDebouncedSearch('')
    setFilters({})
    setDebouncedFilters({})
    setDateFrom(''); setDateTo(''); setCustomFrom(''); setCustomTo('')
    setPage(1)
  }

  function handleSort(field: SortField) {
    if (sortBy === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDir('desc')
    }
    setPage(1)
  }

  function refetch() {
    setRefreshKey((k) => k + 1)
  }

  return {
    localRows, setLocalRows,
    total, setTotal,
    page, setPage,
    loading,
    error, setError,
    search, setSearch,
    debouncedSearch, setDebouncedSearch,
    filters, setFilters,
    debouncedFilters, setDebouncedFilters,
    openFilterCol, setOpenFilterCol,
    sortBy, setSortBy,
    sortDir, setSortDir,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    customFrom, setCustomFrom,
    customTo, setCustomTo,
    activeFilterCount, hasActiveFilters,
    applyPreset, applyCustomDates, clearDateFilter, clearAllFilters,
    handleSort,
    refetch,
    todayISO,
  }
}
