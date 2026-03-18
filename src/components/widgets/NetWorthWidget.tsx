'use client'

import { useEffect, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import type { NetWorthPoint } from '@/app/api/widgets/networth/route'

// ── Types ──────────────────────────────────────────────────────────────────────

type Period = 'last-3-months' | 'last-6-months' | 'last-12-months' | 'ytd' | 'all-time'

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'last-3-months',  label: '3M' },
  { value: 'last-6-months',  label: '6M' },
  { value: 'last-12-months', label: '12M' },
  { value: 'ytd',            label: 'YTD' },
  { value: 'all-time',       label: 'All' },
]

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
  const netWorth = payload.find((p: { dataKey: string }) => p.dataKey === 'netWorth')?.value ?? 0
  return (
    <div className="rounded-lg border border-black/10 bg-white shadow-md px-3 py-2 text-xs min-w-[130px]">
      <p className="font-medium text-[#333] mb-1">{label}</p>
      <div className="flex justify-between gap-4">
        <span className="text-[#16a34a]">Net Worth</span>
        <span className={`font-semibold ${netWorth >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>{fmt(netWorth)}</span>
      </div>
    </div>
  )
}

// ── Saved filter shape stored in preferences ──────────────────────────────────

interface LockedNetWorthFilters {
  period: Period
}

const PREF_KEY = 'networthFilters'

// ── Main widget ────────────────────────────────────────────────────────────────

export function NetWorthWidget() {
  const [period, setPeriod] = useState<Period>('all-time')
  const [data, setData] = useState<NetWorthPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const [saving, setSaving] = useState(false)

  // Load persisted preferences on mount
  useEffect(() => {
    fetch('/api/preferences')
      .then((r) => r.json())
      .then((prefJson) => {
        const saved = prefJson.data?.[PREF_KEY] as LockedNetWorthFilters | undefined
        if (saved) {
          setLocked(true)
          setPeriod(saved.period ?? 'all-time')
        }
      })
  }, [])

  // Fetch data whenever period changes
  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/widgets/networth?period=${period}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error)
        setData(json.data)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [period])

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
      const payload: LockedNetWorthFilters = { period }
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

  const allValues = data.map((d) => d.netWorth)
  const yMin = allValues.length ? Math.floor(Math.min(...allValues) * 1.1) : -1000
  const yMax = allValues.length ? Math.ceil(Math.max(...allValues) * 1.1) : 1000

  return (
    <div className="rounded-lg border bg-white p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-4">
        <div>
          <h3 className="text-sm font-medium text-foreground">Net Worth</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">Cumulative running total over time</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Period pills */}
          <div className="flex items-center gap-1 rounded-lg border border-black/10 p-0.5">
            {PERIOD_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                  period === value
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

      {!loading && !error && (
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={displayData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="nwGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#16a34a" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
              </linearGradient>
            </defs>
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
              domain={[yMin, yMax]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="netWorth"
              stroke="#16a34a"
              strokeWidth={2}
              fill="url(#nwGradient)"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
