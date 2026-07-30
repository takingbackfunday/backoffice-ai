import type { RelativeDateRange } from './RelativeDateRangePicker'

export type DashboardPeriod =
  | 'last-3-months'
  | 'last-6-months'
  | 'last-12-months'
  | 'ytd'
  | 'all-time'
  | 'custom'

export const DASHBOARD_PERIOD_OPTIONS: { value: DashboardPeriod; label: string }[] = [
  { value: 'last-3-months', label: '3M' },
  { value: 'last-6-months', label: '6M' },
  { value: 'last-12-months', label: '12M' },
  { value: 'ytd', label: 'YTD' },
  { value: 'all-time', label: 'All' },
  { value: 'custom', label: 'Custom' },
]

export type ResolvedDateRange =
  | { type: 'live'; period: Exclude<DashboardPeriod, 'custom'> }
  | { type: 'static'; start: string; end: string }

export interface DashboardFilters {
  period: DashboardPeriod
  relativeDateRange?: RelativeDateRange
  selectedCategories: string[]
  drillDown: boolean
}
