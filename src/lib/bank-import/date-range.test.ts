import { describe, expect, it } from 'vitest'
import { computeDefaultRange, formatBankDate, isIsoDate, validateRange } from './date-range'

const today = '2026-10-08'

describe('computeDefaultRange', () => {
  it('uses a three-day overlap from the last transaction', () => {
    expect(computeDefaultRange({ lastTxnDate: '2026-09-14', today })).toEqual({
      from: '2026-09-11', to: today, reason: 'since_last', clamped: false,
    })
  })

  it('uses the last 90 days when there is no history', () => {
    expect(computeDefaultRange({ lastTxnDate: null, today })).toEqual({
      from: '2026-07-11', to: today, reason: 'no_history', clamped: false,
    })
  })

  it('clamps future transaction dates to today', () => {
    expect(computeDefaultRange({ lastTxnDate: '2026-10-20', today }).from).toBe(today)
  })

  it('clamps ranges to the hard maximum', () => {
    expect(computeDefaultRange({ lastTxnDate: '2020-01-01', today })).toEqual({
      from: '2024-10-08', to: today, reason: 'since_last', clamped: true,
    })
  })

  it('honors a lower bank-specific maximum', () => {
    expect(computeDefaultRange({ lastTxnDate: '2026-01-01', today, maxRangeDays: 90 })).toEqual({
      from: '2026-07-11', to: today, reason: 'since_last', clamped: true,
    })
  })

  it('rejects an invalid today date', () => {
    expect(() => computeDefaultRange({ lastTxnDate: null, today: '2026-02-30' })).toThrow()
  })
})

describe('date helpers', () => {
  it('validates actual ISO calendar dates', () => {
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('2026-1-01')).toBe(false)
    expect(isIsoDate('2024-02-29')).toBe(true)
  })

  it('validates date ranges and the hard maximum', () => {
    expect(validateRange('2026-10-09', today, today, null)).not.toBeNull()
    expect(validateRange('2026-10-01', '2026-10-09', today, null)).not.toBeNull()
    expect(validateRange('2024-01-01', today, today, null)).not.toBeNull()
    expect(validateRange('2026-09-11', today, today, null)).toBeNull()
  })

  it('formats dates for each bank locale', () => {
    expect(formatBankDate('2026-09-03', 'MM/DD/YYYY')).toBe('09/03/2026')
    expect(formatBankDate('2026-09-03', 'DD.MM.YYYY')).toBe('03.09.2026')
    expect(formatBankDate('2026-09-03', 'ISO')).toBe('2026-09-03')
  })
})
