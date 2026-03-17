'use client'

import { useEffect, useState } from 'react'
import { ChartRouter } from './charts/ChartRouter'
import { createDefaultWidgetConfig } from '@/lib/widgets/defaults'
import type { ChartDataPoint, WidgetConfig } from '@/types/widgets'

const PERIOD_OPTIONS = [
  { value: 'last-3-months', label: '3M' },
  { value: 'last-6-months', label: '6M' },
  { value: 'last-12-months', label: '12M' },
  { value: 'ytd', label: 'YTD' },
] as const

export function ExpensesByCategoryWidget() {
  const [config, setConfig] = useState<WidgetConfig>(() => createDefaultWidgetConfig('stacked-bar'))
  const [data, setData] = useState<ChartDataPoint[]>([])
  const [seriesKeys, setSeriesKeys] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch('/api/widgets/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error)
        setData(json.data)
        setSeriesKeys(json.seriesKeys)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [config])

  const currentPeriod = config.dateRange.type === 'live' ? config.dateRange.period : 'last-6-months'

  function setPeriod(period: typeof PERIOD_OPTIONS[number]['value']) {
    setConfig((c) => ({ ...c, dateRange: { type: 'live', period } }))
  }

  return (
    <div className="rounded-lg border bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-foreground">Expenses by category</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">Monthly spending breakdown</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-black/10 p-0.5">
          {PERIOD_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setPeriod(value)}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                currentPeriod === value
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

      {!loading && !error && data.length === 0 && (
        <div className="flex items-center justify-center h-[350px]">
          <p className="text-xs text-muted-foreground">No expense data for this period.</p>
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <ChartRouter data={data} seriesKeys={seriesKeys} config={config} />
      )}
    </div>
  )
}
