import type { PivotRow, PivotConfig, PivotResult, PivotGroup, PivotFlatRow, AggregationType, FieldDef } from './types'
import { compareFieldValues } from './field-definitions'

export function aggregate(values: number[], type: AggregationType): number {
  if (values.length === 0) return 0
  const sum = values.reduce((a, b) => a + b, 0)
  switch (type) {
    case 'sum': return sum
    case 'count': return values.length
    case 'avg': return sum / values.length
    case 'min': return Math.min(...values)
    case 'max': return Math.max(...values)
  }
}

export function formatValue(value: number, aggregationType: AggregationType): string {
  if (aggregationType === 'count') {
    return Math.round(value).toLocaleString()
  }
  const abs = Math.abs(value)
  const formatted = abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  if (value < 0) return `($${formatted})`
  if (value === 0) return '$0.00'
  return `$${formatted}`
}

export function computePivot(
  data: PivotRow[],
  config: PivotConfig,
  fieldDefs: FieldDef[]
): PivotResult {
  const totalCount = data.length

  // Step 1: Filter
  let filtered = data
  for (const [key, values] of Object.entries(config.filterValues)) {
    if (values.length === 0) continue
    filtered = filtered.filter(row => {
      const val = (row as unknown as Record<string, unknown>)[key]
      if (Array.isArray(val)) return val.some(v => values.includes(String(v)))
      return values.includes(String(val ?? ''))
    })
  }
  const filteredCount = filtered.length

  // Step 2: Build unique col keys
  const colKeySet = new Set<string>()
  for (const row of filtered) {
    const colKey = config.cols.map(f => String((row as unknown as Record<string, unknown>)[f] ?? '')).join(' · ')
    colKeySet.add(colKey)
  }

  // Sort col keys
  const colKeys = Array.from(colKeySet).sort((a, b) => {
    if (config.cols.length === 1) {
      return compareFieldValues(config.cols[0], a, b)
    }
    return a.localeCompare(b)
  })

  // Step 3: Build value map: rowKey → colKey → number[]
  const valueMap = new Map<string, Map<string, number[]>>()
  const rowKeySet = new Set<string>()

  for (const row of filtered) {
    const rowKey = config.rows.map(f => String((row as unknown as Record<string, unknown>)[f] ?? '')).join(' · ')
    const colKey = config.cols.length > 0
      ? config.cols.map(f => String((row as unknown as Record<string, unknown>)[f] ?? '')).join(' · ')
      : '__total__'
    rowKeySet.add(rowKey)

    if (!valueMap.has(rowKey)) valueMap.set(rowKey, new Map())
    const colMap = valueMap.get(rowKey)!
    if (!colMap.has(colKey)) colMap.set(colKey, [])
    colMap.get(colKey)!.push(row.amount)
  }

  // Step 4: Aggregate and build flat rows
  // Sort row keys
  const sortedRowKeys = Array.from(rowKeySet).sort((a, b) => {
    // Sort by first row field value
    if (config.rows.length === 0) return 0
    const aFirst = a.split(' · ')[0]
    const bFirst = b.split(' · ')[0]
    const cmp = compareFieldValues(config.rows[0], aFirst, bFirst)
    if (cmp !== 0) return cmp
    // Then second field
    if (config.rows.length >= 2) {
      const aParts = a.split(' · ')
      const bParts = b.split(' · ')
      for (let i = 1; i < config.rows.length; i++) {
        const c2 = compareFieldValues(config.rows[i], aParts[i] ?? '', bParts[i] ?? '')
        if (c2 !== 0) return c2
      }
    }
    return 0
  })

  const flatRows: PivotFlatRow[] = []
  const effectiveColKeys = config.cols.length > 0 ? colKeys : ['__total__']

  for (const rowKey of sortedRowKeys) {
    const colMap = valueMap.get(rowKey) ?? new Map()
    const cells: Record<string, number> = {}
    let rowTotal = 0
    const allVals: number[] = []

    for (const ck of effectiveColKeys) {
      const vals = colMap.get(ck) ?? []
      const agg = aggregate(vals, config.aggregation)
      cells[ck] = agg
      allVals.push(...vals)
    }
    rowTotal = aggregate(allVals, config.aggregation)

    flatRows.push({
      rowValues: config.rows.length > 0 ? rowKey.split(' · ') : [],
      cells,
      rowTotal,
    })
  }

  // Step 5: Build groups (outline mode)
  const groups: PivotGroup[] = []
  if (config.rows.length >= 2) {
    // Group by first row field
    const groupMap = new Map<string, PivotFlatRow[]>()
    for (const fr of flatRows) {
      const gk = fr.rowValues[0] ?? ''
      if (!groupMap.has(gk)) groupMap.set(gk, [])
      groupMap.get(gk)!.push(fr)
    }

    for (const [gk, children] of groupMap) {
      const subtotals: Record<string, number> = {}
      const allGroupVals: number[] = []

      for (const ck of effectiveColKeys) {
        const colVals = children.map(c => c.cells[ck] ?? 0)
        subtotals[ck] = aggregate(colVals, config.aggregation)
        allGroupVals.push(...colVals)
      }
      const rowTotal = aggregate(allGroupVals, config.aggregation)

      groups.push({
        key: gk,
        children: children.map(fr => ({
          rowValues: fr.rowValues,
          cells: fr.cells,
          rowTotal: fr.rowTotal,
        })),
        subtotals,
        rowTotal,
      })
    }
  }

  // Step 6: Column totals and grand total
  const colTotals: Record<string, number> = {}
  for (const ck of effectiveColKeys) {
    const vals = flatRows.map(fr => fr.cells[ck] ?? 0)
    colTotals[ck] = aggregate(vals, config.aggregation)
  }
  const grandTotal = aggregate(Object.values(colTotals), config.aggregation)

  return {
    groups,
    flatRows,
    colKeys: effectiveColKeys,
    colTotals,
    grandTotal,
    filteredCount,
    totalCount,
  }
}
