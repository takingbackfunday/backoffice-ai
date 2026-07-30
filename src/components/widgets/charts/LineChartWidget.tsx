'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { ChartContainer } from './ChartContainer'
import { getColor } from '@/lib/widgets/colors'
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

export function LineChartWidget({ data, seriesKeys, config, currency = DEFAULT_CURRENCY }: Props) {
  return (
    <ChartContainer>
      <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        {config.showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />}
        <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: '#6b7280' }} />
        <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => formatAmount(v, currency)} tick={{ fill: '#6b7280' }} width={64} />
        {config.showTooltip && (
          <Tooltip
            formatter={(value, name) => [formatAmount(Number(value), currency), name]}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
        )}
        {config.showLegend && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {seriesKeys.map((key, i) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={getColor(config.colorScheme, i)}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ChartContainer>
  )
}
