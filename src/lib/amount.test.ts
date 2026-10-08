import { describe, expect, it } from 'vitest'
import { resolveSplitAmount } from '@/lib/amount'

describe('resolveSplitAmount', () => {
  it.each([
    ['45.00', '', { ok: true, amount: -45 }],
    ['-45.00', '', { ok: true, amount: -45 }],
    ['', '2,000.00', { ok: true, amount: 2000 }],
    ['1.234,56', '', { ok: true, amount: -1234.56 }],
    ['(12.50)', '', { ok: true, amount: -12.5 }],
    ['0.00', '100', { ok: true, amount: 100 }],
    ['12', '0', { ok: true, amount: -12 }],
    ['0.00', '', { ok: true, amount: 0 }],
  ] as const)('resolves debit %j and credit %j', (debit, credit, expected) => {
    expect(resolveSplitAmount(debit, credit)).toEqual(expected)
  })

  it('rejects two empty sides', () => {
    expect(resolveSplitAmount('', '')).toEqual({ ok: false, reason: 'empty' })
    expect(resolveSplitAmount('  ', undefined)).toEqual({ ok: false, reason: 'empty' })
  })

  it('rejects non-zero values on both sides', () => {
    expect(resolveSplitAmount('10', '5')).toEqual({ ok: false, reason: 'both', debit: '10', credit: '5' })
  })

  it('identifies an invalid value and its column side', () => {
    expect(resolveSplitAmount('abc', '')).toEqual({ ok: false, reason: 'invalid', side: 'debit', raw: 'abc' })
    expect(resolveSplitAmount('', 'n/a')).toEqual({ ok: false, reason: 'invalid', side: 'credit', raw: 'n/a' })
  })
})
