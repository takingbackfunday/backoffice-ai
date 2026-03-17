import type { WidgetConfig } from '@/types/widgets'

export function createDefaultWidgetConfig(chartType: WidgetConfig['chartType'] = 'stacked-bar'): WidgetConfig {
  return {
    chartType,
    splitBy: 'category',
    granularity: 'month',
    dateRange: { type: 'live', period: 'last-6-months' },
    topN: {
      enabled: true,
      count: 8,
      otherLabel: 'Other',
      sortBy: 'value',
      sortDirection: 'desc',
    },
    filters: [],
    showLegend: true,
    showGrid: true,
    showTooltip: true,
    stacked: true,
    colorScheme: 'default',
  }
}
