'use client'

import { useEffect, useRef, useState } from 'react'
import { ChartRouter } from './charts/ChartRouter'
import { createDefaultWidgetConfig } from '@/lib/widgets/defaults'
import type { ChartDataPoint, WidgetConfig } from '@/types/widgets'

// ── Types ──────────────────────────────────────────────────────────────────────

interface CategoryGroup {
  id: string
  name: string
  categories: { id: string; name: string }[]
}

type Period = 'last-3-months' | 'last-6-months' | 'last-12-months' | 'ytd' | 'custom'

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'last-3-months', label: '3M' },
  { value: 'last-6-months', label: '6M' },
  { value: 'last-12-months', label: '12M' },
  { value: 'ytd', label: 'YTD' },
  { value: 'custom', label: 'Custom' },
]

// ── Category filter dropdown ───────────────────────────────────────────────────

function CategoryFilterDropdown({
  groups,
  selected,
  onChange,
}: {
  groups: CategoryGroup[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const allCategories = groups.flatMap((g) => g.categories)
  // Include "Uncategorized" as a selectable virtual category
  const allNames = [...allCategories.map((c) => c.name), 'Uncategorized']

  function toggleAll() {
    onChange(selected.size === allNames.length ? new Set() : new Set(allNames))
  }

  function toggle(name: string) {
    const next = new Set(selected)
    next.has(name) ? next.delete(name) : next.add(name)
    onChange(next)
  }

  const label = selected.size === 0 || selected.size === allNames.length
    ? 'All categories'
    : `${selected.size} categor${selected.size === 1 ? 'y' : 'ies'}`

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
          selected.size > 0 && selected.size < allNames.length
            ? 'border-[#534AB7]/40 bg-[#EEEDFE] text-[#3C3489]'
            : 'border-black/10 text-muted-foreground hover:text-foreground'
        }`}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 8h10M11 12h2" />
        </svg>
        {label}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-black/10 rounded-lg shadow-lg w-56 py-1 max-h-72 overflow-y-auto">
          <button
            onClick={toggleAll}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 text-left"
          >
            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
              selected.size === allNames.length ? 'bg-[#3C3489] border-[#3C3489]' : 'border-black/20'
            }`}>
              {selected.size === allNames.length && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </span>
            <span className="font-medium">All categories</span>
          </button>

          <div className="border-t border-black/5 mt-1 pt-1">
            {groups.map((group) => (
              <div key={group.id}>
                <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{group.name}</p>
                {group.categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => toggle(cat.name)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 text-left"
                  >
                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                      selected.has(cat.name) ? 'bg-[#3C3489] border-[#3C3489]' : 'border-black/20'
                    }`}>
                      {selected.has(cat.name) && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    {cat.name}
                  </button>
                ))}
              </div>
            ))}
            {/* Uncategorized as a virtual selectable row */}
            <div className="border-t border-black/5 mt-1 pt-1">
              <button
                onClick={() => toggle('Uncategorized')}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 text-left"
              >
                <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                  selected.has('Uncategorized') ? 'bg-[#3C3489] border-[#3C3489]' : 'border-black/20'
                }`}>
                  {selected.has('Uncategorized') && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="text-muted-foreground italic">Uncategorized</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Saved filter shape stored in preferences ──────────────────────────────────

interface LockedChartFilters {
  period: Period
  customStart?: string
  customEnd?: string
  selectedCategories: string[]
}

const PREF_KEY = 'chartFilters'

// ── Main widget ────────────────────────────────────────────────────────────────

export function ExpensesByCategoryWidget() {
  const [config, setConfig] = useState<WidgetConfig>(() => createDefaultWidgetConfig('stacked-bar'))
  const [data, setData] = useState<ChartDataPoint[]>([])
  const [seriesKeys, setSeriesKeys] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([])
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())

  const [activePeriod, setActivePeriod] = useState<Period>('last-6-months')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const [locked, setLocked] = useState(false)
  const [saving, setSaving] = useState(false)

  // Load categories + persisted preferences on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/widgets/categories').then((r) => r.json()),
      fetch('/api/preferences').then((r) => r.json()),
    ]).then(([catJson, prefJson]) => {
      if (!catJson.error) setCategoryGroups(catJson.data ?? [])

      const saved = prefJson.data?.[PREF_KEY] as LockedChartFilters | undefined
      if (saved) {
        setLocked(true)
        const period = saved.period ?? 'last-6-months'
        setActivePeriod(period)
        if (saved.customStart) setCustomStart(saved.customStart)
        if (saved.customEnd) setCustomEnd(saved.customEnd)
        const cats = new Set<string>(saved.selectedCategories ?? [])
        setSelectedCategories(cats)

        // Apply to config immediately
        setConfig((c) => {
          const withPeriod = period === 'custom' && saved.customStart && saved.customEnd
            ? { ...c, dateRange: { type: 'static' as const, start: saved.customStart!, end: saved.customEnd! } }
            : { ...c, dateRange: { type: 'live' as const, period: period as Exclude<Period, 'custom'> } }
          const isAll = cats.size === 0
          return {
            ...withPeriod,
            filters: isAll
              ? withPeriod.filters.filter((f) => f.field !== 'category')
              : [
                  ...withPeriod.filters.filter((f) => f.field !== 'category'),
                  { field: 'category' as const, operator: 'include' as const, values: [...cats] },
                ],
          }
        })
      }
    })
  }, [])

  // Fetch chart data whenever config changes
  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch('/api/widgets/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error)
        setData(json.data)
        setSeriesKeys(json.seriesKeys)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [config])

  function setPeriod(period: Period) {
    setActivePeriod(period)
    if (period === 'custom') return
    setConfig((c) => ({ ...c, dateRange: { type: 'live', period: period as Exclude<Period, 'custom'> } }))
  }

  function applyCustomRange() {
    if (!customStart || !customEnd) return
    setConfig((c) => ({ ...c, dateRange: { type: 'static', start: customStart, end: customEnd } }))
  }

  function handleCategoryChange(next: Set<string>) {
    setSelectedCategories(next)
    const allCategories = [...categoryGroups.flatMap((g) => g.categories).map((c) => c.name), 'Uncategorized']
    const isAll = next.size === 0 || next.size === allCategories.length
    setConfig((c) => ({
      ...c,
      filters: isAll
        ? c.filters.filter((f) => f.field !== 'category')
        : [
            ...c.filters.filter((f) => f.field !== 'category'),
            { field: 'category', operator: 'include', values: [...next] },
          ],
    }))
  }

  async function toggleLock() {
    setSaving(true)
    if (locked) {
      // Unlock — clear saved filters
      await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [PREF_KEY]: null }),
      })
      setLocked(false)
    } else {
      // Lock — save current filters
      const payload: LockedChartFilters = {
        period: activePeriod,
        customStart: customStart || undefined,
        customEnd: customEnd || undefined,
        selectedCategories: [...selectedCategories],
      }
      await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [PREF_KEY]: payload }),
      })
      setLocked(true)
    }
    setSaving(false)
  }

  return (
    <div className="rounded-lg border bg-white p-5">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4 gap-4">
        <div>
          <h3 className="text-sm font-medium text-foreground">Expenses by category</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">Monthly spending breakdown</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Category filter */}
          {categoryGroups.length > 0 && (
            <CategoryFilterDropdown
              groups={categoryGroups}
              selected={selectedCategories}
              onChange={handleCategoryChange}
            />
          )}

          {/* Period pills */}
          <div className="flex items-center gap-1 rounded-lg border border-black/10 p-0.5">
            {PERIOD_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                  activePeriod === value
                    ? 'bg-[#3C3489] text-[#EEEDFE]'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Lock button */}
          <button
            onClick={toggleLock}
            disabled={saving}
            title={locked ? 'Filters locked — click to unlock' : 'Lock current filters'}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
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
      </div>

      {/* Custom date range inputs */}
      {activePeriod === 'custom' && (
        <div className="flex items-center gap-2 mb-4">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="text-xs border border-black/15 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#534AB7]/30"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="text-xs border border-black/15 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#534AB7]/30"
          />
          <button
            onClick={applyCustomRange}
            disabled={!customStart || !customEnd}
            className="text-xs px-3 py-1.5 rounded-lg bg-[#3C3489] text-[#EEEDFE] hover:bg-[#2d2770] disabled:opacity-40 transition-colors"
          >
            Apply
          </button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center h-[350px]">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full border-2 border-[#534AB7] border-t-transparent animate-spin" />
            Loading…
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center h-[350px]">
          <p className="text-xs text-red-500">{error}</p>
        </div>
      )}

      {!loading && !error && data.length === 0 && (
        <div className="flex items-center justify-center h-[350px]">
          <p className="text-xs text-muted-foreground">No expense data for this period.</p>
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <ChartRouter data={data} seriesKeys={seriesKeys} config={config} />
      )}
    </div>
  )
}
