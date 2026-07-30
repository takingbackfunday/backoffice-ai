import { describe, it, expect } from 'vitest'
import { sortSeriesByTotal } from '@/lib/widgets/series-order'
import type { ChartDataPoint } from '@/types/widgets'

describe('sortSeriesByTotal', () => {
  it('sorts series keys descending by total value', () => {
    const data: ChartDataPoint[] = [
      { label: 'Jan', a: 100, b: 50, c: 75 },
      { label: 'Feb', a: 200, b: 25, c: 75 },
    ]
    expect(sortSeriesByTotal(data, ['a', 'b', 'c'])).toEqual(['a', 'c', 'b'])
  })

  it('puts zero-value series last', () => {
    const data: ChartDataPoint[] = [
      { label: 'Jan', a: 10, b: 0, c: 5 },
    ]
    expect(sortSeriesByTotal(data, ['a', 'b', 'c'])).toEqual(['a', 'c', 'b'])
  })

  it('preserves original order for equal totals', () => {
    const data: ChartDataPoint[] = [
      { label: 'Jan', a: 10, b: 10 },
    ]
    expect(sortSeriesByTotal(data, ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('ignores non-numeric values', () => {
    const data: ChartDataPoint[] = [
      { label: 'Jan', a: 100, b: 'oops' as unknown as number },
    ]
    expect(sortSeriesByTotal(data, ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('returns empty array for empty series keys', () => {
    expect(sortSeriesByTotal([], [])).toEqual([])
  })
})
