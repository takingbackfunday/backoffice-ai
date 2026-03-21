'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
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
  const slices = seriesKeys.map((key, i) => ({
    name: key,
    value: data.reduce((sum, d) => sum + (typeof d[key] === 'number' ? (d[key] as number) : 0), 0),
    color: getColor(config.colorScheme, i),
  })).filter((s) => s.value > 0)

  const total = slices.reduce((sum, s) => sum + s.value, 0)

  return (
    <div className="flex items-center gap-3 w-full" style={{ height: 210 }}>
      {/* Donut chart — fixed width so it never crowds the legend */}
      <div className="shrink-0" style={{ width: 180, height: 210 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={82}
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
            >
              {slices.map((s, i) => (
                <Cell key={i} fill={s.color} />
              ))}
            </Pie>
            {config.showTooltip && (
              <Tooltip
                formatter={(v) => [formatAmount(Number(v)), '']}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend — right side, scrollable if many items */}
      {config.showLegend && (
        <div className="flex-1 min-w-0 flex flex-col gap-1 overflow-y-auto max-h-[210px] pr-1">
          {slices.map((s) => (
            <div key={s.name} className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-[11px] text-muted-foreground truncate min-w-0">{s.name}</span>
              <span className="text-[11px] font-medium tabular-nums ml-auto shrink-0 pl-2">
                {total > 0 ? `${Math.round((s.value / total) * 100)}%` : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
