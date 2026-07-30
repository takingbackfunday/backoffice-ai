'use client'

import { useEffect, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { CashflowPoint } from '@/app/api/widgets/cashflow/route'
import type { DashboardCurrency } from '@/lib/currency'
import { CURRENCY_SYMBOLS, DEFAULT_CURRENCY } from '@/lib/currency'
import type { ResolvedDateRange } from './dashboard-types'

interface CashflowWidgetProps {
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
  return d.toLocaleString('default', { month: 'short' })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null
  const income = payload.find((p: { dataKey: string }) => p.dataKey === 'income')?.value ?? 0
  const expenses = payload.find((p: { dataKey: string }) => p.dataKey === 'expenses')?.value ?? 0
  const net = payload.find((p: { dataKey: string }) => p.dataKey === 'net')?.value ?? 0
  return (
    <div className="rounded-lg border border-black/10 bg-white shadow-md px-3 py-2 text-xs space-y-1 min-w-[130px]">
      <p className="font-medium text-[#333] mb-1">{label}</p>
      <div className="flex justify-between gap-4">
        <span className="text-[#16a34a]">Income</span>
        <span className="font-medium text-[#16a34a]">{fmt(income, currency)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-[#dc2626]">Expenses</span>
        <span className="font-medium text-[#dc2626]">{fmt(expenses, currency)}</span>
      </div>
      <div className="flex justify-between gap-4 border-t border-black/[0.08] pt-1 mt-1">
        <span className="text-[#534AB7]">Net</span>
        <span className={`font-semibold ${net >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>{net >= 0 ? '+' : ''}{fmt(net, currency)}</span>
      </div>
    </div>
  )
}

export function CashflowWidget({ currency, dateRange, selectedCategories }: CashflowWidgetProps) {
  const [data, setData] = useState<CashflowPoint[]>([])
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
      ? `/api/widgets/cashflow?period=custom&start=${dateRange.start}&end=${dateRange.end}&currency=${currency}${categoriesParam}`
      : `/api/widgets/cashflow?period=${dateRange.period}&currency=${currency}${categoriesParam}`

    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error)
        setData(json.data)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [dateRange, selectedCategories, currency])

  const displayData = data.map((d) => ({ ...d, label: shortMonth(d.label) }))

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <h3 className="text-xs font-medium text-foreground whitespace-nowrap">Cashflow</h3>
        <span className="text-[10px] text-muted-foreground">· Income, expenses &amp; net</span>
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
              tickFormatter={(v) => fmt(v, currency)}
              tick={{ fill: '#6b7280' }}
              width={64}
            />
            <Tooltip content={<CustomTooltip currency={currency} />} />
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
