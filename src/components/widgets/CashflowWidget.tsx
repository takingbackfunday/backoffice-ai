'use client'

import { useEffect, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import type { CashflowPoint } from '@/app/api/widgets/cashflow/route'

type Period = 'last-3-months' | 'last-6-months' | 'last-12-months' | 'ytd'

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'last-3-months',  label: '3M' },
  { value: 'last-6-months',  label: '6M' },
  { value: 'last-12-months', label: '12M' },
  { value: 'ytd',            label: 'YTD' },
]

function fmt(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1000) return `$${(value / 1000).toFixed(1)}k`
  return `$${value.toFixed(0)}`
}

function shortMonth(label: string): string {
  // label is 'YYYY-MM' — convert to 'Jan', 'Feb', etc.
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
      <div className="flex justify-between gap-4 border-t border-black/8 pt-1 mt-1">
        <span className="text-[#534AB7]">Net</span>
        <span className={`font-semibold ${net >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>{fmt(net)}</span>
      </div>
    </div>
  )
}

export function CashflowWidget() {
  const [period, setPeriod] = useState<Period>('last-6-months')
  const [data, setData] = useState<CashflowPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/widgets/cashflow?period=${period}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error)
        setData(json.data)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [period])

  // For the Y axis domain: include a small buffer above max and below min
  const allValues = data.flatMap((d) => [d.income, d.expenses, d.net])
  const yMin = allValues.length ? Math.floor(Math.min(...allValues) * 1.1) : -1000
  const yMax = allValues.length ? Math.ceil(Math.max(...allValues) * 1.1) : 1000

  const displayData = data.map((d) => ({ ...d, label: shortMonth(d.label) }))

  return (
    <div className="rounded-lg border bg-white p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-4">
        <div>
          <h3 className="text-sm font-medium text-foreground">Cashflow</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">Income, expenses &amp; net by month</p>
        </div>

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
          <ComposedChart data={displayData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <ReferenceLine y={0} stroke="#d1d5db" strokeWidth={1} />
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
              width={56}
              domain={[yMin, yMax]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              formatter={(value) =>
                value === 'income' ? 'Income' : value === 'expenses' ? 'Expenses' : 'Net'
              }
            />
            <Bar dataKey="income"   fill="#16a34a" opacity={0.85} maxBarSize={40} radius={[3, 3, 0, 0]} />
            <Bar dataKey="expenses" fill="#dc2626" opacity={0.85} maxBarSize={40} radius={[0, 0, 3, 3]} />
            <Line
              dataKey="net"
              stroke="#534AB7"
              strokeWidth={2}
              dot={{ r: 3, fill: '#534AB7', strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              type="monotone"
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
