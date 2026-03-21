'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { CashflowPoint } from '@/app/api/widgets/cashflow/route'
import { RelativeDateRangePicker, resolveExpr, toDateString } from './RelativeDateRangePicker'
import type { RelativeDateRange } from './RelativeDateRangePicker'

// ── Types ──────────────────────────────────────────────────────────────────────

interface CategoryGroup {
  id: string
  name: string
  categories: { id: string; name: string }[]
}

type Period = 'last-3-months' | 'last-6-months' | 'last-12-months' | 'ytd' | 'custom'

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'last-3-months',  label: '3M' },
  { value: 'last-6-months',  label: '6M' },
  { value: 'last-12-months', label: '12M' },
  { value: 'ytd',            label: 'YTD' },
  { value: 'custom',         label: 'Custom' },
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
        className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border transition-colors ${
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
        <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-black/10 rounded-lg shadow-lg w-56 py-1 max-h-72 overflow-y-auto">
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1000) return `$${(value / 1000).toFixed(1)}k`
  return `$${value.toFixed(0)}`
}

function shortMonth(label: string): string {
  const [year, month] = label.split('-')
  const d = new Date(Number(year), Number(month) - 1)
  return d.toLocaleString('default', { month: 'short' })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const income   = payload.find((p: { dataKey: string }) => p.dataKey === 'income')?.value ?? 0
  const expenses = payload.find((p: { dataKey: string }) => p.dataKey === 'expenses')?.value ?? 0
  const net      = payload.find((p: { dataKey: string }) => p.dataKey === 'net')?.value ?? 0
  return (
    <div className="rounded-lg border border-black/10 bg-white shadow-md px-3 py-2 text-xs space-y-1 min-w-[130px]">
      <p className="font-medium text-[#333] mb-1">{label}</p>
      <div className="flex justify-between gap-4">
        <span className="text-[#16a34a]">Income</span>
        <span className="font-medium text-[#16a34a]">{fmt(income)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-[#dc2626]">Expenses</span>
        <span className="font-medium text-[#dc2626]">{fmt(expenses)}</span>
      </div>
      <div className="flex justify-between gap-4 border-t border-black/[0.08] pt-1 mt-1">
        <span className="text-[#534AB7]">Net</span>
        <span className={`font-semibold ${net >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>{net >= 0 ? '+' : ''}{fmt(net)}</span>
      </div>
    </div>
  )
}

// ── Saved filter shape stored in preferences ──────────────────────────────────

interface LockedCashflowFilters {
  period: Period
  relativeDateRange?: RelativeDateRange
  selectedCategories: string[]
}

const PREF_KEY = 'cashflowFilters'

// ── Main widget ────────────────────────────────────────────────────────────────

export function CashflowWidget() {
  const [period, setPeriod] = useState<Period>('last-6-months')
  const [relativeDateRange, setRelativeDateRange] = useState<RelativeDateRange>({
    start: { anchor: 'today', operator: 'minus', value: 7, unit: 'day' },
    end:   { anchor: 'today', operator: 'minus', value: 1, unit: 'day' },
  })
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([])
  const [data, setData] = useState<CashflowPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  // appliedRange drives the fetch — only updated when Apply is clicked for custom
  const [appliedRange, setAppliedRange] = useState<{ period: Period; start?: string; end?: string }>({ period: 'last-6-months' })

  // Load categories + persisted preferences on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/widgets/categories').then((r) => r.json()),
      fetch('/api/preferences').then((r) => r.json()),
    ]).then(([catJson, prefJson]) => {
      if (!catJson.error) setCategoryGroups(catJson.data ?? [])

      const saved = prefJson.data?.[PREF_KEY] as LockedCashflowFilters | undefined
      if (saved) {
        setLocked(true)
        const p = saved.period ?? 'last-6-months'
        setPeriod(p)
        if (saved.relativeDateRange) setRelativeDateRange(saved.relativeDateRange)
        setSelectedCategories(new Set(saved.selectedCategories ?? []))
        if (p === 'custom' && saved.relativeDateRange) {
          const start = toDateString(resolveExpr(saved.relativeDateRange.start))
          const end   = toDateString(resolveExpr(saved.relativeDateRange.end))
          setAppliedRange({ period: p, start, end })
        } else {
          setAppliedRange({ period: p })
        }
      }
    })
  }, [])

  // Fetch cashflow data whenever appliedRange or selectedCategories changes
  useEffect(() => {
    if (appliedRange.period === 'custom' && (!appliedRange.start || !appliedRange.end)) return
    setLoading(true)
    setError(null)

    const allCategories = [...categoryGroups.flatMap((g) => g.categories).map((c) => c.name), 'Uncategorized']
    const isAll = selectedCategories.size === 0 || selectedCategories.size === allCategories.length
    const categoriesParam = isAll ? '' : `&categories=${encodeURIComponent([...selectedCategories].join(','))}`

    const url = appliedRange.period === 'custom'
      ? `/api/widgets/cashflow?period=custom&start=${appliedRange.start}&end=${appliedRange.end}${categoriesParam}`
      : `/api/widgets/cashflow?period=${appliedRange.period}${categoriesParam}`

    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error)
        setData(json.data)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [appliedRange, selectedCategories, categoryGroups])

  function handlePeriod(p: Period) {
    setPeriod(p)
    if (p !== 'custom') setAppliedRange({ period: p })
  }

  function handleCategoryChange(next: Set<string>) {
    setSelectedCategories(next)
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
      const payload: LockedCashflowFilters = {
        period,
        relativeDateRange: period === 'custom' ? relativeDateRange : undefined,
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

  const displayData = data.map((d) => ({ ...d, label: shortMonth(d.label) }))

  return (
    <div className="rounded-lg border bg-white p-3">
      {/* Header */}
      <div className="mb-3">
        
        <div className="flex items-center gap-1.5"><h3 className="text-xs font-medium text-foreground whitespace-nowrap">Cashflow</h3><span className="text-[10px] text-muted-foreground">· Income, expenses &amp; net</span></div>
        <div className="flex items-center gap-2 mt-2">
          {/* Period pills */}
          <div className="flex items-center gap-1 rounded-lg border border-black/10 p-0.5">
            {PERIOD_OPTIONS.map(({ value, label }) => (
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
      </div>

      {/* Collapsible filters row */}
      {filtersOpen && (
        <div className="flex items-center gap-2 pt-2 pb-1 border-t border-black/5 flex-wrap w-full">
          {categoryGroups.length > 0 && (
            <CategoryFilterDropdown
              groups={categoryGroups}
              selected={selectedCategories}
              onChange={handleCategoryChange}
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

      {/* Custom relative date range picker */}
      {period === 'custom' && (
        <RelativeDateRangePicker
          value={relativeDateRange}
          onChange={setRelativeDateRange}
          onApply={(start, end) => setAppliedRange({ period: 'custom', start, end })}
          onCancel={() => handlePeriod('last-6-months')}
          appliedStart={appliedRange.start}
          appliedEnd={appliedRange.end}
        />
      )}

      {loading && (
        <div className="flex items-center justify-center h-[210px]">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full border-2 border-[#534AB7] border-t-transparent animate-spin" />
            Loading…
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center h-[210px]">
          <p className="text-xs text-red-500">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <ResponsiveContainer width="100%" height={210}>
          <ComposedChart data={displayData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barGap={2} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis
              dataKey="label"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#6b7280' }}
            />
            <YAxis
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={fmt}
              tick={{ fill: '#6b7280' }}
              width={64}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(value) =>
                value === 'income' ? 'Income' : value === 'expenses' ? 'Expenses' : 'Net'
              }
            />
            <Bar dataKey="income" fill="#16a34a" fillOpacity={0.85} maxBarSize={22} radius={[3, 3, 0, 0]} />
            <Bar dataKey="expenses" fill="#dc2626" fillOpacity={0.85} maxBarSize={22} radius={[3, 3, 0, 0]} />
            <Line
              dataKey="net"
              stroke="transparent"
              strokeWidth={0}
              dot={{ r: 4, fill: '#534AB7', strokeWidth: 0 }}
              activeDot={{ r: 6, fill: '#534AB7', strokeWidth: 0 }}
              type="monotone"
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
