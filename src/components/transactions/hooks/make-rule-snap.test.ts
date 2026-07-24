import { describe, it, expect } from 'vitest'
import { mergeSnap, type MakeRuleSnapType } from './make-rule-snap'

const categoryEdit = {
  description: 'AMZN MKTP DE',
  categoryId: 'cat-1',
  categoryName: 'Groceries',
}

const payeeEdit = {
  description: 'AMZN MKTP DE',
  payeeId: 'pay-1',
  payeeName: 'Amazon',
}

describe('mergeSnap', () => {
  it('builds a snap from a single edit with nulls for untouched fields', () => {
    expect(mergeSnap(null, categoryEdit)).toEqual({
      description: 'AMZN MKTP DE',
      payeeId: null,
      payeeName: null,
      categoryId: 'cat-1',
      categoryName: 'Groceries',
    } satisfies MakeRuleSnapType)
  })

  it('keeps the earlier payee when a later category-only edit has payeeName null', () => {
    const prev = mergeSnap(null, payeeEdit)
    const merged = mergeSnap(prev, { ...categoryEdit, payeeId: null, payeeName: null })
    expect(merged.payeeId).toBe('pay-1')
    expect(merged.payeeName).toBe('Amazon')
    expect(merged.categoryId).toBe('cat-1')
    expect(merged.categoryName).toBe('Groceries')
  })

  it('keeps the earlier category when a later payee-only edit has category null', () => {
    const prev = mergeSnap(null, categoryEdit)
    const merged = mergeSnap(prev, { ...payeeEdit, categoryId: null, categoryName: null })
    expect(merged.categoryId).toBe('cat-1')
    expect(merged.categoryName).toBe('Groceries')
    expect(merged.payeeId).toBe('pay-1')
    expect(merged.payeeName).toBe('Amazon')
  })

  it('lets a later non-null value overwrite an earlier one', () => {
    const prev = mergeSnap(null, payeeEdit)
    const merged = mergeSnap(prev, {
      description: 'AMZN MKTP DE',
      payeeId: 'pay-2',
      payeeName: 'Amazon Marketplace',
    })
    expect(merged.payeeId).toBe('pay-2')
    expect(merged.payeeName).toBe('Amazon Marketplace')
  })

  it('always takes the latest description', () => {
    const prev = mergeSnap(null, payeeEdit)
    const merged = mergeSnap(prev, { ...categoryEdit, description: 'PAYPAL *AMZN' })
    expect(merged.description).toBe('PAYPAL *AMZN')
  })

  it('handles undefined prev fields like null', () => {
    const merged = mergeSnap(undefined, payeeEdit)
    expect(merged).toEqual({
      description: 'AMZN MKTP DE',
      payeeId: 'pay-1',
      payeeName: 'Amazon',
      categoryId: null,
      categoryName: null,
    } satisfies MakeRuleSnapType)
  })
})
