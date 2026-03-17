import type { WidgetConfig, ChartDataPoint, SplitBy } from '@/types/widgets'
import type { RawDataRow } from './data-fetcher'
import { formatDateBucket } from './date-utils'

export function transformData(
  rows: RawDataRow[],
  config: WidgetConfig
): { data: ChartDataPoint[]; seriesKeys: string[] } {
  const grouped = groupRows(rows, config)
  const { grouped: topNGrouped, seriesKeys } = applyTopN(grouped, config)
  const data = toChartData(topNGrouped, seriesKeys)
  return { data, seriesKeys }
}

// outer key = time bucket (e.g. "2024-01")
// inner key = series name (e.g. "Groceries")
type GroupedData = Map<string, Map<string, number>>

function groupRows(rows: RawDataRow[], config: WidgetConfig): GroupedData {
  const grouped: GroupedData = new Map()

  for (const row of rows) {
    const timeBucket = formatDateBucket(row.date, config.granularity)
    const seriesKey = getSplitValue(row, config.splitBy)

    if (!grouped.has(timeBucket)) grouped.set(timeBucket, new Map())
    const bucket = grouped.get(timeBucket)!
    bucket.set(seriesKey, (bucket.get(seriesKey) ?? 0) + row.amount)
  }

  return grouped
}

function getSplitValue(row: RawDataRow, splitBy: SplitBy): string {
  switch (splitBy) {
    case 'category': return row.category
    case 'group': return row.categoryGroup
    case 'payee': return row.payee
    case 'account': return row.account
    case 'month': return 'Total'
  }
}

function applyTopN(
  grouped: GroupedData,
  config: WidgetConfig
): { grouped: GroupedData; seriesKeys: string[] } {
  if (!config.topN.enabled) {
    const allKeys = new Set<string>()
    for (const bucket of grouped.values()) {
      for (const key of bucket.keys()) allKeys.add(key)
    }
    return { grouped, seriesKeys: [...allKeys].sort() }
  }

  const totals = new Map<string, number>()
  for (const bucket of grouped.values()) {
    for (const [key, val] of bucket.entries()) {
      totals.set(key, (totals.get(key) ?? 0) + val)
    }
  }

  const sorted = [...totals.entries()].sort((a, b) => {
    if (config.topN.sortBy === 'value') {
      return config.topN.sortDirection === 'desc' ? b[1] - a[1] : a[1] - b[1]
    }
    return config.topN.sortDirection === 'desc'
      ? b[0].localeCompare(a[0])
      : a[0].localeCompare(b[0])
  })

  const topKeys = new Set(sorted.slice(0, config.topN.count).map(([k]) => k))
  const otherLabel = config.topN.otherLabel

  const result: GroupedData = new Map()
  for (const [timeBucket, bucket] of grouped.entries()) {
    const newBucket = new Map<string, number>()
    let otherSum = 0

    for (const [key, val] of bucket.entries()) {
      if (topKeys.has(key)) {
        newBucket.set(key, val)
      } else {
        otherSum += val
      }
    }

    if (otherSum > 0) newBucket.set(otherLabel, otherSum)
    result.set(timeBucket, newBucket)
  }

  const seriesKeys = [...topKeys].sort()
  const hasOther = [...result.values()].some((b) => b.has(otherLabel))
  if (hasOther) seriesKeys.push(otherLabel)

  return { grouped: result, seriesKeys }
}

function toChartData(grouped: GroupedData, seriesKeys: string[]): ChartDataPoint[] {
  const sortedBuckets = [...grouped.keys()].sort()

  return sortedBuckets.map((timeBucket) => {
    const bucket = grouped.get(timeBucket)!
    const point: ChartDataPoint = { label: timeBucket }
    for (const key of seriesKeys) {
      point[key] = bucket.get(key) ?? 0
    }
    return point
  })
}
