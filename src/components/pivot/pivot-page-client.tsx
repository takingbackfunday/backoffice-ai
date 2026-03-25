'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { PivotRow, PivotConfig, AggregationType, ViewMode } from '@/lib/pivot/types'
import { FIELD_DEFINITIONS } from '@/lib/pivot/field-definitions'
import { computePivot } from '@/lib/pivot/engine'
import { PivotToolbar } from './pivot-toolbar'
import { PivotFieldBar } from './pivot-field-bar'
import { PivotTable } from './pivot-table'
import Link from 'next/link'

const DEFAULT_CONFIG: PivotConfig = {
  rows: ['taxSchedule', 'category'],
  cols: ['quarter'],
  reportFilters: [],
  filterValues: {},
  aggregation: 'sum',
  viewMode: 'outline',
  showSubtotals: true,
  showGrandTotals: true,
}

export function PivotPageClient() {
  const [data, setData] = useState<PivotRow[]>([])
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<PivotConfig>(DEFAULT_CONFIG)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didRestorePrefs = useRef(false)

  // Fetch data
  useEffect(() => {
    fetch('/api/pivot/')
      .then(r => r.json())
      .then(res => {
        if (res.data) setData(res.data)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Restore preferences on mount
  useEffect(() => {
    fetch('/api/preferences')
      .then(r => r.json())
      .then(res => {
        if (res.data?.pivotConfig && !didRestorePrefs.current) {
          didRestorePrefs.current = true
          setConfig({ ...DEFAULT_CONFIG, ...res.data.pivotConfig })
        }
      })
      .catch(() => {})
  }, [])

  // Debounced config persistence
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pivotConfig: config }),
      }).catch(() => {})
    }, 500)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [config])

  // Unique values per field
  const uniqueValues = useMemo(() => {
    const map: Record<string, Set<string>> = {}
    for (const row of data) {
      for (const fd of FIELD_DEFINITIONS) {
        if (!map[fd.key]) map[fd.key] = new Set()
        const val = (row as Record<string, unknown>)[fd.key]
        if (Array.isArray(val)) val.forEach(v => map[fd.key].add(String(v)))
        else map[fd.key].add(String(val ?? ''))
      }
    }
    const result: Record<string, string[]> = {}
    for (const [key, set] of Object.entries(map)) {
      result[key] = Array.from(set).sort()
    }
    return result
  }, [data])

  // Compute pivot
  const pivotResult = useMemo(
    () => computePivot(data, config, FIELD_DEFINITIONS),
    [data, config]
  )

  // Config helpers
  const setAggregation = useCallback((agg: AggregationType) => setConfig(c => ({ ...c, aggregation: agg })), [])
  const setViewMode = useCallback((vm: ViewMode) => setConfig(c => ({ ...c, viewMode: vm })), [])
  const setShowSubtotals = useCallback((v: boolean) => setConfig(c => ({ ...c, showSubtotals: v })), [])
  const setShowGrandTotals = useCallback((v: boolean) => setConfig(c => ({ ...c, showGrandTotals: v })), [])

  const setFieldFilter = useCallback((key: string, values: string[]) =>
    setConfig(c => ({ ...c, filterValues: { ...c.filterValues, [key]: values } })), [])

  const clearFieldFilter = useCallback((key: string) =>
    setConfig(c => {
      const fv = { ...c.filterValues }
      delete fv[key]
      return { ...c, filterValues: fv }
    }), [])

  const moveField = useCallback((key: string, from: string, to: string) => {
    setConfig(c => {
      const n = { ...c }
      if (from === 'rows') n.rows = c.rows.filter(k => k !== key)
      else if (from === 'cols') n.cols = c.cols.filter(k => k !== key)
      else if (from === 'reportFilters') n.reportFilters = c.reportFilters.filter(k => k !== key)
      else if (from === 'available') {} // no-op removal

      if (to === 'rows') n.rows = [...n.rows, key]
      else if (to === 'cols') n.cols = [...n.cols, key]
      else if (to === 'reportFilters') n.reportFilters = [...n.reportFilters, key]
      return n
    })
  }, [])

  const removeField = useCallback((key: string, from: string) => {
    setConfig(c => {
      const fv = { ...c.filterValues }
      delete fv[key]
      const n = { ...c, filterValues: fv }
      if (from === 'rows') n.rows = c.rows.filter(k => k !== key)
      else if (from === 'cols') n.cols = c.cols.filter(k => k !== key)
      else if (from === 'reportFilters') n.reportFilters = c.reportFilters.filter(k => k !== key)
      return n
    })
  }, [])

  const applyPreset = useCallback((preset: Partial<PivotConfig>) => {
    setConfig(c => ({
      ...c,
      ...preset,
      reportFilters: preset.reportFilters ?? [],
      filterValues: preset.filterValues ?? {},
    }))
  }, [])

  const handleReportFilterChange = useCallback((key: string, value: string) => {
    if (!value) clearFieldFilter(key)
    else setFieldFilter(key, [value])
  }, [setFieldFilter, clearFieldFilter])

  const handleDrop = useCallback((key: string, from: string, to: string) => {
    if (from === 'available') {
      moveField(key, 'available', to)
    } else {
      moveField(key, from, to)
    }
  }, [moveField])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <span className="ml-3 text-sm text-muted-foreground">Loading transactions…</span>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-medium text-foreground mb-2">No transactions found</p>
        <p className="text-sm text-muted-foreground mb-4">Import some data first to use the pivot table.</p>
        <Link href="/upload" className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 transition-colors">
          Import CSV
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col rounded-lg border overflow-hidden bg-background">
      <PivotToolbar
        aggregation={config.aggregation}
        viewMode={config.viewMode}
        showSubtotals={config.showSubtotals}
        showGrandTotals={config.showGrandTotals}
        rowCount={config.rows.length}
        filteredCount={pivotResult.filteredCount}
        totalCount={pivotResult.totalCount}
        onAggregation={setAggregation}
        onViewMode={setViewMode}
        onShowSubtotals={setShowSubtotals}
        onShowGrandTotals={setShowGrandTotals}
        onApplyPreset={applyPreset}
      />
      <PivotFieldBar
        rows={config.rows}
        cols={config.cols}
        reportFilters={config.reportFilters}
        filterValues={config.filterValues}
        onDrop={handleDrop}
        onRemove={removeField}
        onReportFilterChange={handleReportFilterChange}
        uniqueValues={uniqueValues}
      />
      <PivotTable
        result={pivotResult}
        config={config}
        uniqueValues={uniqueValues}
        onSetFilter={setFieldFilter}
        onClearFilter={clearFieldFilter}
      />
    </div>
  )
}
