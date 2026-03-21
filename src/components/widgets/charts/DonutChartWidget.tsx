'use client'

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { getColor } from '@/lib/widgets/colors'
import type { ChartDataPoint, WidgetConfig } from '@/types/widgets'

interface Props {
  data: ChartDataPoint[]
  seriesKeys: string[]
  config: WidgetConfig
}

function formatAmount(value: number): string {
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}k`
  return `$${value.toFixed(0)}`
}

export function DonutChartWidget({ data, seriesKeys, config }: Props) {
  const slices = seriesKeys.map((key) => ({
    name: key,
    value: data.reduce((sum, d) => sum + (typeof d[key] === 'number' ? (d[key] as number) : 0), 0),
  })).filter((s) => s.value > 0)

  return (
    <ResponsiveContainer width="100%" height={210}>
      <PieChart>
        <Pie
          data={slices}
          cx="50%"
          cy="42%"
          innerRadius={50}
          outerRadius={85}
          paddingAngle={2}
          dataKey="value"
          nameKey="name"
        >
          {slices.map((_, i) => (
            <Cell key={i} fill={getColor(config.colorScheme, i)} />
          ))}
        </Pie>
        {config.showTooltip && (
          <Tooltip
            formatter={(v) => [formatAmount(Number(v)), '']}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
        )}
        {config.showLegend && <Legend wrapperStyle={{ fontSize: 12 }} />}
      </PieChart>
    </ResponsiveContainer>
  )
}
