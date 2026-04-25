'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { ChartContainer } from './ChartContainer'
import { getColor } from '@/lib/widgets/colors'
import type { ChartDataPoint, WidgetConfig } from '@/types/widgets'

interface Props {
  data: ChartDataPoint[]
  seriesKeys: string[]
  config: WidgetConfig
}

function formatAmount(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return ''
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}k`
  return `$${value.toFixed(0)}`
}

export function LineChartWidget({ data, seriesKeys, config }: Props) {
  return (
    <ChartContainer>
      <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        {config.showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />}
        <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: '#6b7280' }} />
        <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={formatAmount} tick={{ fill: '#6b7280' }} width={64} />
        {config.showTooltip && (
          <Tooltip
            formatter={(v) => [formatAmount(Number(v)), '']}
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
