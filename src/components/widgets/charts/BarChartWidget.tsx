'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
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

export function BarChartWidget({ data, seriesKeys, config }: Props) {
  return (
    <ChartContainer>
      <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        {config.showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />}
        <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: '#6b7280' }} />
        <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={formatAmount} tick={{ fill: '#6b7280' }} width={64} />
        {config.showTooltip && (
          <Tooltip
            formatter={(v) => [formatAmount(Number(v)), '']}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
        )}
        {config.showLegend && <Legend wrapperStyle={{ fontSize: 9 }} />}
        {seriesKeys.map((key, i) => (
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
