'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChartRouter } from './charts/ChartRouter'
import { createDefaultWidgetConfig } from '@/lib/widgets/defaults'
import type { ChartDataPoint, WidgetConfig } from '@/types/widgets'
import type { DashboardCurrency } from '@/lib/currency'
import type { ResolvedDateRange } from './dashboard-types'

interface ExpensesByCategoryWidgetProps {
  currency: DashboardCurrency
  dateRange: ResolvedDateRange
  selectedCategories: string[]
  drillDown: boolean
}

export function ExpensesByCategoryWidget({
  currency,
  dateRange,
  selectedCategories,
  drillDown,
}: ExpensesByCategoryWidgetProps) {
  const config = useMemo<WidgetConfig>(
    () => ({
      ...createDefaultWidgetConfig('stacked-bar'),
      splitBy: drillDown ? 'category' : 'group',
      dateRange,
      filters:
        selectedCategories.length > 0
          ? [{ field: 'category', operator: 'include', values: selectedCategories }]
          : [],
    }),
    [dateRange, selectedCategories, drillDown]
  )

  const [data, setData] = useState<ChartDataPoint[]>([])
  const [seriesKeys, setSeriesKeys] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError(null)
    fetch('/api/widgets/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config, currency }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error)
        setData(json.data)
        setSeriesKeys(json.seriesKeys)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [config, currency])

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <h3 className="text-xs font-medium text-foreground whitespace-nowrap">Expenses by category</h3>
        <span className="text-[10px] text-muted-foreground truncate">· by {drillDown ? 'sub-category' : 'group'}</span>
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

      {!loading && !error && data.length === 0 && (
        <div className="flex items-center justify-center h-[210px]">
          <p className="text-xs text-muted-foreground">No expense data for this period.</p>
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <ChartRouter data={data} seriesKeys={seriesKeys} config={config} currency={currency} />
      )}
    </div>
  )
}
