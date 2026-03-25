export type AggregationType = 'sum' | 'count' | 'avg' | 'min' | 'max'
export type ViewMode = 'tabular' | 'outline'

export interface PivotRow {
  id: string
  date: string
  month: string
  quarter: string
  year: string
  dayOfWeek: string
  category: string
  categoryGroup: string
  taxSchedule: string
  taxType: string
  payee: string
  account: string
  accountType: string
  project: string
  projectType: string
  type: string
  description: string
  amount: number
  tags: string[]
}

export interface PivotConfig {
  rows: string[]
  cols: string[]
  reportFilters: string[]
  filterValues: Record<string, string[]>
  aggregation: AggregationType
  viewMode: ViewMode
  showSubtotals: boolean
  showGrandTotals: boolean
}

export interface PivotResult {
  groups: PivotGroup[]
  flatRows: PivotFlatRow[]
  colKeys: string[]
  colTotals: Record<string, number>
  grandTotal: number
  filteredCount: number
  totalCount: number
}

export interface PivotGroup {
  key: string
  children: PivotGroupChild[]
  subtotals: Record<string, number>
  rowTotal: number
}

export interface PivotGroupChild {
  rowValues: string[]
  cells: Record<string, number>
  rowTotal: number
}

export interface PivotFlatRow {
  rowValues: string[]
  cells: Record<string, number>
  rowTotal: number
}

export interface FieldDef {
  key: string
  label: string
  group: string
}
