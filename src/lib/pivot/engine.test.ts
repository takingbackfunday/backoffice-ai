import { describe, it, expect } from 'vitest'
import { formatValue, aggregate } from './engine'
import type { AggregationType } from './types'

describe('formatValue', () => {
  it('count returns a locale string with no symbol', () => {
    expect(formatValue(1234, 'count')).toBe('1,234')
    expect(formatValue(0, 'count')).toBe('0')
  })

  it('defaults to $ symbol when no opts provided', () => {
    expect(formatValue(100, 'sum')).toBe('$100.00')
    expect(formatValue(0, 'sum')).toBe('$0.00')
    expect(formatValue(-50, 'sum')).toBe('($50.00)')
  })

  it('uses the provided symbol', () => {
    expect(formatValue(100, 'sum', false, { symbol: '€' })).toBe('€100.00')
    expect(formatValue(100, 'sum', false, { symbol: '£' })).toBe('£100.00')
    expect(formatValue(-50, 'sum', false, { symbol: '€' })).toBe('(€50.00)')
  })

  it('truncate rounds and drops decimals', () => {
    expect(formatValue(1234.56, 'sum', true)).toBe('$1,235')
    expect(formatValue(0, 'sum', true)).toBe('$0')
    expect(formatValue(-1234.56, 'sum', true, { symbol: '£' })).toBe('(£1,235)')
  })

  it('thousands separators are applied to non-truncated values', () => {
    expect(formatValue(1234567.89, 'sum')).toBe('$1,234,567.89')
  })

  it('count ignores the symbol and truncate opts', () => {
    expect(formatValue(42, 'count', true, { symbol: '€' })).toBe('42')
  })
})

describe('aggregate', () => {
  it.each<[AggregationType, number[], number]>([
    ['sum', [1, 2, 3], 6],
    ['count', [1, 2, 3], 3],
    ['avg', [10, 20, 30], 20],
    ['min', [5, 1, 9], 1],
    ['max', [5, 1, 9], 9],
    ['sum', [], 0],
    ['count', [], 0],
  ])('aggregate(%s, %j) → %s', (type, values, expected) => {
    expect(aggregate(values, type)).toBe(expected)
  })
})
