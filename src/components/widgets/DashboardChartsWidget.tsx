'use client'

import { useEffect, useMemo, useState } from 'react'
import { CategoryFilterDropdown, type CategoryGroup } from './CategoryFilterDropdown'
import { RelativeDateRangePicker, resolveExpr, toDateString } from './RelativeDateRangePicker'
import type { RelativeDateRange } from './RelativeDateRangePicker'
import { ExpensesByCategoryWidget } from './ExpensesByCategoryWidget'
import { ExpensesByDonutWidget } from './ExpensesByDonutWidget'
import { CashflowWidget } from './CashflowWidget'
import { NetWorthWidget } from './NetWorthWidget'
import type { DashboardCurrency } from '@/lib/currency'
import {
  DASHBOARD_PERIOD_OPTIONS,
  type DashboardFilters,
  type DashboardPeriod,
  type ResolvedDateRange,
} from './dashboard-types'

const PREF_KEY = 'dashboardFilters'
const LEGACY_PREF_KEYS = ['chartFilters', 'donutFilters', 'cashflowFilters', 'networthFilters']

const DEFAULT_PERIOD: DashboardPeriod = 'last-6-months'
const DEFAULT_RELATIVE_RANGE: RelativeDateRange = {
  start: { anchor: 'today', operator: 'minus', value: 7, unit: 'day' },
  end: { anchor: 'today', operator: 'minus', value: 1, unit: 'day' },
}

interface DashboardChartsWidgetProps {
  currency: DashboardCurrency
}

export function DashboardChartsWidget({ currency }: DashboardChartsWidgetProps) {
  const [period, setPeriod] = useState<DashboardPeriod>(DEFAULT_PERIOD)
  const [relativeDateRange, setRelativeDateRange] = useState<RelativeDateRange>(DEFAULT_RELATIVE_RANGE)
  const [appliedCustom, setAppliedCustom] = useState<{ start: string; end: string } | null>(null)
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [drillDown, setDrillDown] = useState(false)
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([])
  const [locked, setLocked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  const resolvedRange: ResolvedDateRange | null = useMemo(() => {
    if (period === 'custom') {
      if (!appliedCustom) return null
      return { type: 'static', start: appliedCustom.start, end: appliedCustom.end }
    }
    return { type: 'live', period }
  }, [period, appliedCustom])

  const allCategoryNames = useMemo(
    () => [...categoryGroups.flatMap((g) => g.categories).map((c) => c.name), 'Uncategorized'],
    [categoryGroups],
  )

  // Normalise selectedCategories to a strict-subset array for child charts.
  // Empty or full selection means "no filter".
  const categoriesParam = useMemo(() => {
    if (selectedCategories.size === 0 || selectedCategories.size === allCategoryNames.length) return []
    return [...selectedCategories]
  }, [selectedCategories, allCategoryNames])

  // Load categories + persisted preferences on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/widgets/categories').then((r) => r.json()),
      fetch('/api/preferences').then((r) => r.json()),
    ]).then(([catJson, prefJson]) => {
      if (!catJson.error) setCategoryGroups(catJson.data ?? [])

      const saved = (prefJson.data?.[PREF_KEY] ?? prefJson.data?.chartFilters) as DashboardFilters | undefined
      if (saved) {
        setLocked(true)
        const savedPeriod = saved.period ?? DEFAULT_PERIOD
        setPeriod(savedPeriod)
        if (saved.relativeDateRange) setRelativeDateRange(saved.relativeDateRange)
        const cats = new Set<string>(saved.selectedCategories ?? [])
        setSelectedCategories(cats)
        setDrillDown(saved.drillDown ?? false)

        if (savedPeriod === 'custom' && saved.relativeDateRange) {
          const start = toDateString(resolveExpr(saved.relativeDateRange.start))
          const end = toDateString(resolveExpr(saved.relativeDateRange.end))
          setAppliedCustom({ start, end })
        }
      }
      setHydrated(true)
    })
  }, [])

  function handlePeriod(next: DashboardPeriod) {
    setPeriod(next)
    if (next !== 'custom') setAppliedCustom(null)
  }

  function handleApplyCustom(start: string, end: string) {
    setAppliedCustom({ start, end })
  }

  function handleCancelCustom() {
    setPeriod(DEFAULT_PERIOD)
    setAppliedCustom(null)
  }

  async function toggleLock() {
    setSaving(true)
    if (locked) {
      await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [PREF_KEY]: null }),
      })
      setLocked(false)
    } else {
      const payload: DashboardFilters = {
        period,
        relativeDateRange: period === 'custom' ? relativeDateRange : undefined,
        selectedCategories: [...selectedCategories],
        drillDown,
      }
      const body: Record<string, unknown> = { [PREF_KEY]: payload }
      for (const key of LEGACY_PREF_KEYS) body[key] = null
      await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setLocked(true)
    }
    setSaving(false)
  }

  return (
    <div className="rounded-lg border bg-white p-3">
      {/* Shared filter header */}
      <div className="mb-3">
        <div className="flex items-center gap-2">
          {/* Period pills */}
          <div className="flex items-center gap-1 rounded-lg border border-black/10 p-0.5">
            {DASHBOARD_PERIOD_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => handlePeriod(value)}
                className={`px-2 py-0.5 text-[11px] rounded-md font-medium transition-colors ${
                  period === value
                    ? 'bg-[#3C3489] text-[#EEEDFE]'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Filters disclosure toggle */}
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-black/10 text-muted-foreground hover:text-foreground hover:border-black/20 transition-colors"
          >
            Filters
            <svg className={`w-3 h-3 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Collapsible filters row */}
        {filtersOpen && (
          <div className="flex items-center gap-2 pt-2 pb-1 mt-2 border-t border-black/5 flex-wrap w-full">
            {/* Drill-down toggle */}
            <button
              onClick={() => setDrillDown((v) => !v)}
              className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border transition-colors ${
                drillDown
                  ? 'border-[#534AB7]/40 bg-[#EEEDFE] text-[#3C3489]'
                  : 'border-black/10 text-muted-foreground hover:text-foreground'
              }`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
              {drillDown ? 'Sub-categories' : 'Groups'}
            </button>

            {categoryGroups.length > 0 && (
              <CategoryFilterDropdown
                groups={categoryGroups}
                selected={selectedCategories}
                onChange={setSelectedCategories}
              />
            )}

            <button
              onClick={toggleLock}
              disabled={saving}
              title={locked ? 'Filters locked — click to unlock' : 'Lock current filters'}
              className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border transition-colors disabled:opacity-50 ${
                locked
                  ? 'border-[#085041]/30 bg-[#E1F5EE] text-[#085041] hover:bg-[#d0efe5]'
                  : 'border-black/10 text-muted-foreground hover:text-foreground hover:border-black/20'
              }`}
            >
              {locked ? (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
              )}
              {locked ? 'Locked' : 'Lock'}
            </button>
          </div>
        )}
      </div>

      {/* Custom relative date range picker */}
      {period === 'custom' && (
        <RelativeDateRangePicker
          value={relativeDateRange}
          onChange={setRelativeDateRange}
          onApply={handleApplyCustom}
          onCancel={handleCancelCustom}
          appliedStart={appliedCustom?.start}
          appliedEnd={appliedCustom?.end}
        />
      )}

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {resolvedRange && (
          <>
            <ExpensesByCategoryWidget
              currency={currency}
              dateRange={resolvedRange}
              selectedCategories={categoriesParam}
              drillDown={drillDown}
            />
            <ExpensesByDonutWidget
              currency={currency}
              dateRange={resolvedRange}
              selectedCategories={categoriesParam}
              drillDown={drillDown}
            />
            <CashflowWidget
              currency={currency}
              dateRange={resolvedRange}
              selectedCategories={categoriesParam}
            />
            <NetWorthWidget
              currency={currency}
              dateRange={resolvedRange}
              selectedCategories={categoriesParam}
            />
          </>
        )}
        {!resolvedRange && !hydrated && (
          <div className="col-span-full flex items-center justify-center h-[210px]">
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full border-2 border-[#534AB7] border-t-transparent animate-spin" />
              Loading…
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
