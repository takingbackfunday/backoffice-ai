'use client'

import { useState } from 'react'

type SortField = 'date' | 'amount' | 'description' | 'category'
type SortDir = 'asc' | 'desc'

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

export function useNlSearch(opts: {
  setFilters: React.Dispatch<React.SetStateAction<ColumnFilters>>
  setDebouncedFilters: React.Dispatch<React.SetStateAction<ColumnFilters>>
  setSearch: React.Dispatch<React.SetStateAction<string>>
  setDebouncedSearch: React.Dispatch<React.SetStateAction<string>>
  setDateFrom: React.Dispatch<React.SetStateAction<string>>
  setDateTo: React.Dispatch<React.SetStateAction<string>>
  setSortBy: React.Dispatch<React.SetStateAction<SortField>>
  setSortDir: React.Dispatch<React.SetStateAction<SortDir>>
  setPage: React.Dispatch<React.SetStateAction<number>>
  setError: React.Dispatch<React.SetStateAction<string | null>>
  clearAllFilters: () => void
}) {
  const { setFilters, setDebouncedFilters, setSearch, setDebouncedSearch, setDateFrom, setDateTo, setSortBy, setSortDir, setPage, setError, clearAllFilters } = opts

  const [aiMode, setAiMode] = useState(false)
  const [aiQuery, setAiQuery] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiExplanation, setAiExplanation] = useState('')

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

  return {
    aiMode, setAiMode,
    aiQuery, setAiQuery,
    aiLoading,
    aiExplanation,
    handleAiSearch, clearAiSearch,
  }
}
