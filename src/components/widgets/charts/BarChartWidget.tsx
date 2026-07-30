'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { ChartContainer } from './ChartContainer'
import { getColor } from '@/lib/widgets/colors'
import { sortSeriesByTotal } from '@/lib/widgets/series-order'
import { CURRENCY_SYMBOLS, DEFAULT_CURRENCY } from '@/lib/currency'
import type { DashboardCurrency } from '@/lib/currency'
import type { ChartDataPoint, WidgetConfig } from '@/types/widgets'

interface Props {
  data: ChartDataPoint[]
  seriesKeys: string[]
  config: WidgetConfig
  currency?: DashboardCurrency
}

function formatAmount(value: number | null | undefined, currency = DEFAULT_CURRENCY): string {
  if (value == null || !isFinite(value)) return ''
  const sym = CURRENCY_SYMBOLS[currency] ?? CURRENCY_SYMBOLS[DEFAULT_CURRENCY]
  if (Math.abs(value) >= 1000) return `${sym}${(value / 1000).toFixed(1)}k`
  return `${sym}${value.toFixed(0)}`
}

export function BarChartWidget({ data, seriesKeys, config, currency = DEFAULT_CURRENCY }: Props) {
  const orderedKeys = sortSeriesByTotal(data, seriesKeys)

  return (
    <ChartContainer>
      <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        {config.showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />}
        <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: '#6b7280' }} />
        <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatAmount(v, currency)} tick={{ fill: '#6b7280' }} width={64} />
        {config.showTooltip && (
          <Tooltip
            formatter={(value, name) => [formatAmount(Number(value), currency), name]}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
        )}
        {config.showLegend && <Legend wrapperStyle={{ fontSize: 9 }} />}
        {orderedKeys.map((key, i) => (
          <Bar
            key={key}
            dataKey={key}
            fill={getColor(config.colorScheme, i)}
            stackId={config.stacked ? 'stack' : undefined}
            radius={config.stacked ? undefined : [3, 3, 0, 0]}
            maxBarSize={48}
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}
