'use client'

import { useEffect, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import type { NetWorthPoint } from '@/app/api/widgets/networth/route'
import type { DashboardCurrency } from '@/lib/currency'
import { CURRENCY_SYMBOLS, DEFAULT_CURRENCY } from '@/lib/currency'
import type { ResolvedDateRange } from './dashboard-types'

interface NetWorthWidgetProps {
  currency: DashboardCurrency
  dateRange: ResolvedDateRange
  selectedCategories: string[]
}

const SYMBOLS = CURRENCY_SYMBOLS as Record<string, string>

function fmt(value: number | null | undefined, currency = DEFAULT_CURRENCY): string {
  if (value == null || !isFinite(value)) return ''
  const sym = SYMBOLS[currency] ?? CURRENCY_SYMBOLS[DEFAULT_CURRENCY]
  const abs = Math.abs(value)
  if (abs >= 1000) return `${sym}${(value / 1000).toFixed(1)}k`
  return `${sym}${value.toFixed(0)}`
}

function shortMonth(label: string): string {
  const [year, month] = label.split('-')
  const d = new Date(Number(year), Number(month) - 1)
  return d.toLocaleString('default', { month: 'short', year: '2-digit' })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, currency }: any) {
  if (!active || !payload?.length) return null
  const point = payload[0]
  const netWorth: number = point?.value ?? 0
  const rawLabel: string = point?.payload?.rawLabel ?? point?.payload?.label ?? ''
  const displayLabel = rawLabel.includes('-') ? shortMonth(rawLabel) : rawLabel
  return (
    <div className="rounded-lg border border-black/10 bg-white shadow-md px-3 py-2 text-xs min-w-[130px]">
      <p className="font-medium text-[#333] mb-1">{displayLabel}</p>
      <div className="flex justify-between gap-4">
        <span className="text-[#16a34a]">Net Worth</span>
        <span className={`font-semibold ${netWorth >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>{fmt(netWorth, currency)}</span>
      </div>
    </div>
  )
}

export function NetWorthWidget({ currency, dateRange, selectedCategories }: NetWorthWidgetProps) {
  const [data, setData] = useState<NetWorthPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)

    const categoriesParam = selectedCategories.length > 0
      ? `&categories=${encodeURIComponent(selectedCategories.join(','))}`
      : ''

    const url = dateRange.type === 'static'
      ? `/api/widgets/networth?period=custom&start=${dateRange.start}&end=${dateRange.end}&currency=${currency}${categoriesParam}`
      : `/api/widgets/networth?period=${dateRange.period}&currency=${currency}${categoriesParam}`

    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error)
        setData(json.data)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [dateRange, selectedCategories, currency])

  const displayData = data.map((d) => ({
    ...d,
    rawLabel: d.label,
    label: shortMonth(d.label),
  }))

  const allValues = data.map((d) => d.netWorth)
  const yMin = allValues.length ? Math.floor(Math.min(...allValues) * 1.1) : -1000
  const yMax = allValues.length ? Math.ceil(Math.max(...allValues) * 1.1) : 1000

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <h3 className="text-xs font-medium text-foreground whitespace-nowrap">Net Worth</h3>
        <span className="text-[10px] text-muted-foreground">· Cumulative running total</span>
      </div>

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
          <AreaChart data={displayData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="nwGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#16a34a" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis
              dataKey="rawLabel"
              tickFormatter={shortMonth}
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#6b7280' }}
            />
            <YAxis
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => fmt(v, currency)}
              tick={{ fill: '#6b7280' }}
              width={64}
              domain={[yMin, yMax]}
            />
            <Tooltip content={<CustomTooltip currency={currency} />} />
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
