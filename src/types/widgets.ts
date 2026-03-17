// ── Chart types the system supports ──
export type ChartType = 'bar' | 'stacked-bar' | 'line' | 'area' | 'donut'

// ── How to split/group the data ──
export type SplitBy = 'category' | 'group' | 'payee' | 'account' | 'month'

// ── Time granularity ──
export type Granularity = 'day' | 'week' | 'month' | 'quarter' | 'year'

// ── Date range can be live (relative) or static ──
export type DateRange =
  | { type: 'live'; period: 'this-month' | 'last-month' | 'last-3-months' | 'last-6-months' | 'last-12-months' | 'ytd' | 'all-time' }
  | { type: 'static'; start: string; end: string }

// ── Top-N bucketing config ──
export interface TopNConfig {
  enabled: boolean
  count: number
  otherLabel: string
  sortBy: 'value' | 'name'
  sortDirection: 'asc' | 'desc'
}

// ── Filter for what data to include ──
export interface DataFilter {
  field: SplitBy
  operator: 'include' | 'exclude'
  values: string[]
}

// ── The complete widget config object ──
export interface WidgetConfig {
  chartType: ChartType
  splitBy: SplitBy
  granularity: Granularity
  dateRange: DateRange
  topN: TopNConfig
  filters: DataFilter[]
  showLegend: boolean
  showGrid: boolean
  showTooltip: boolean
  stacked: boolean
  colorScheme: string
}

// ── Widget with metadata ──
export interface Widget {
  id: string
  dashboardId: string
  title: string
  config: WidgetConfig
  position: { x: number; y: number; w: number; h: number }
}

// ── Shape of data after transformation, ready for Recharts ──
export interface ChartDataPoint {
  label: string
  [seriesKey: string]: string | number
}
