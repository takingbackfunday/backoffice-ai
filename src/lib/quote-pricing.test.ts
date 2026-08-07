import { describe, it, expect } from 'vitest'
import { maxTagMargin, autoPrice, itemMarginPercent, quoteTotals } from './quote-pricing'

describe('maxTagMargin', () => {
  it('returns the max matching margin', () => {
    const map = new Map([['design', 20], ['dev', 30], ['rush', 50]])
    expect(maxTagMargin(['design', 'rush'], map)).toBe(50)
  })

  it('returns 0 when no tags match', () => {
    const map = new Map([['design', 20]])
    expect(maxTagMargin(['dev'], map)).toBe(0)
  })

  it('returns 0 for empty tags', () => {
    expect(maxTagMargin([], new Map())).toBe(0)
  })
})

describe('autoPrice', () => {
  it('applies max matching tag margin', () => {
    const map = new Map([['design', 20], ['rush', 50]])
    expect(autoPrice(100, ['design', 'rush'], map)).toBe(150)
  })

  it('returns costRate when no margin matches', () => {
    expect(autoPrice(100, ['dev'], new Map())).toBe(100)
  })

  it('rounds to 2 decimal places', () => {
    const map = new Map([['design', 33.33]])
    expect(autoPrice(100, ['design'], map)).toBe(133.33)
  })
})

describe('itemMarginPercent', () => {
  it('calculates margin percentage', () => {
    expect(itemMarginPercent(100, 150)).toBe(50)
  })

  it('returns null for null costRate', () => {
    expect(itemMarginPercent(null, 150)).toBeNull()
  })

  it('returns null for zero costRate', () => {
    expect(itemMarginPercent(0, 150)).toBeNull()
  })
})

describe('quoteTotals', () => {
  it('sums totalCost and totalQuoted', () => {
    const items = [
      { quantity: 2, unitPrice: 150, costRate: 100, isOptional: false },
      { quantity: 1, unitPrice: 300, costRate: 200, isOptional: false },
    ]
    const result = quoteTotals(items)
    expect(result.totalCost).toBe(400)
    expect(result.totalQuoted).toBe(600)
  })

  it('excludes optional items', () => {
    const items = [
      { quantity: 2, unitPrice: 150, costRate: 100, isOptional: false },
      { quantity: 1, unitPrice: 50, costRate: 30, isOptional: true },
    ]
    const result = quoteTotals(items)
    expect(result.totalCost).toBe(200)
    expect(result.totalQuoted).toBe(300)
  })

  it('handles null costRate (contributes 0 to cost)', () => {
    const items = [
      { quantity: 1, unitPrice: 100, costRate: null, isOptional: false },
    ]
    const result = quoteTotals(items)
    expect(result.totalCost).toBe(0)
    expect(result.totalQuoted).toBe(100)
  })
})
