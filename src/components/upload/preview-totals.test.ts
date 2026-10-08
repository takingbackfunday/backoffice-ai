import { describe, it, expect } from 'vitest'
import { computePreviewTotals } from './preview-totals'
import type { PreviewRow } from '@/types'

const row = (amount: number, isDuplicate = false): PreviewRow => ({
  date: '2026-01-01',
  amount,
  description: 'x',
  duplicateHash: `h-${amount}-${isDuplicate}`,
  isDuplicate,
  rawData: {},
  suggestedCategory: null,
  suggestedCategoryId: null,
  payeeId: null,
  suggestionConfidence: null,
  matchedRuleId: null,
})

describe('computePreviewTotals', () => {
  it('sums expenses and revenue separately and nets them', () => {
    const t = computePreviewTotals([row(-10.5), row(-20.25), row(100), row(50)])
    expect(t.expenseCount).toBe(2)
    expect(t.expenseSum).toBe('-30.75')
    expect(t.revenueCount).toBe(2)
    expect(t.revenueSum).toBe('150.00')
    expect(t.totalCount).toBe(4)
    expect(t.net).toBe('119.25')
    expect(t.netNegative).toBe(false)
  })

  it('excludes duplicates from all figures', () => {
    const t = computePreviewTotals([row(-10), row(40, true), row(5)])
    expect(t.expenseCount).toBe(1)
    expect(t.revenueCount).toBe(1)
    expect(t.totalCount).toBe(2)
    expect(t.net).toBe('5.00')
  })

  it('reports a negative net when expenses exceed revenue', () => {
    const t = computePreviewTotals([row(-100), row(40)])
    expect(t.net).toBe('60.00')
    expect(t.netNegative).toBe(true)
  })

  it('counts zero-amount rows in the total but in neither bucket', () => {
    const t = computePreviewTotals([row(0), row(10)])
    expect(t.totalCount).toBe(2)
    expect(t.expenseCount).toBe(0)
    expect(t.revenueCount).toBe(1)
  })

  it('handles an empty input', () => {
    const t = computePreviewTotals([])
    expect(t.totalCount).toBe(0)
    expect(t.net).toBe('0.00')
    expect(t.netNegative).toBe(false)
  })

  it('avoids float drift on decimal sums', () => {
    const t = computePreviewTotals([row(0.1), row(0.2)])
    expect(t.revenueSum).toBe('0.30')
    expect(t.net).toBe('0.30')
  })
})
