import { describe, it, expect } from 'vitest'
import { processCSV, parseAmount, type CsvMapping } from '@/lib/csv-processor'

const baseMapping: CsvMapping = {
  dateCol: 'Date',
  amountCol: 'Amount',
  descCol: 'Description',
  dateFormat: 'DD.MM.YYYY',
  amountSign: 'normal',
}

describe('processCSV — DD.MM.YYYY date format', () => {
  const csv = [
    'Date,Description,Amount',
    '23.07.2026,Grocery Store,-45.50',
    '01.01.2026,Salary,3200.00',
    '5.3.2026,No Padding Day,-1.25',
  ].join('\n')

  it('parses dot-separated dates', () => {
    const result = processCSV(csv, baseMapping, 'acct-1')
    expect(result.skippedCount).toBe(0)
    expect(result.rows).toHaveLength(3)
    expect(result.rows[0].date.toISOString().slice(0, 10)).toBe('2026-07-23')
    expect(result.rows[1].date.toISOString().slice(0, 10)).toBe('2026-01-01')
  })

  it('accepts non-padded day and month', () => {
    const result = processCSV(csv, baseMapping, 'acct-1')
    expect(result.rows[2].date.toISOString().slice(0, 10)).toBe('2026-03-05')
  })

  it('rejects invalid dot dates', () => {
    const bad = 'Date,Description,Amount\n45.07.2026,Bad Day,-1.00\n10.13.2026,Bad Month,-2.00'
    const result = processCSV(bad, baseMapping, 'acct-1')
    expect(result.rows).toHaveLength(0)
    expect(result.skippedCount).toBe(2)
  })

  it('does not parse dot dates under slash formats', () => {
    const result = processCSV(csv, { ...baseMapping, dateFormat: 'DD/MM/YYYY' }, 'acct-1')
    expect(result.rows).toHaveLength(0)
    expect(result.skippedCount).toBe(3)
  })

  it('slash dates still parse under their own format', () => {
    const slashCsv = 'Date,Description,Amount\n31/12/2024,Party,-99.00'
    const result = processCSV(slashCsv, { ...baseMapping, dateFormat: 'DD/MM/YYYY' }, 'acct-1')
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].date.toISOString().slice(0, 10)).toBe('2024-12-31')
  })
})

describe('parseAmount — US and European number formats', () => {
  it('parses US format with comma thousands', () => {
    expect(parseAmount('1,234.56', false)).toBe(1234.56)
    expect(parseAmount('$1,234.56', false)).toBe(1234.56)
  })

  it('parses European format with dot thousands and comma decimal', () => {
    expect(parseAmount('1.234,56', false)).toBe(1234.56)
    expect(parseAmount('€ 1.234,56', false)).toBe(1234.56)
  })

  it('parses a bare decimal comma', () => {
    expect(parseAmount('-45,50', false)).toBe(-45.5)
    expect(parseAmount('12,5', false)).toBe(12.5)
  })

  it('treats a lone comma grouping 3 digits as thousands', () => {
    expect(parseAmount('1,234', false)).toBe(1234)
  })

  it('parses multi-group thousands in both styles', () => {
    expect(parseAmount('1,234,567.89', false)).toBe(1234567.89)
    expect(parseAmount('1.234.567,89', false)).toBe(1234567.89)
  })

  it('parses plain dot decimals and integers', () => {
    expect(parseAmount('3200.00', false)).toBe(3200)
    expect(parseAmount('1234', false)).toBe(1234)
  })

  it('handles parenthesised negatives', () => {
    expect(parseAmount('(1.234,56)', false)).toBe(-1234.56)
    expect(parseAmount('(1,234.56)', false)).toBe(-1234.56)
  })

  it('handles trailing-minus negatives (German Soll style)', () => {
    expect(parseAmount('45,50-', false)).toBe(-45.5)
  })

  it('applies the inverted sign flag', () => {
    expect(parseAmount('12,50', true)).toBe(-12.5)
    expect(parseAmount('-12,50', true)).toBe(12.5)
  })

  it('returns null for non-numeric values', () => {
    expect(parseAmount('abc', false)).toBeNull()
    expect(parseAmount('', false)).toBeNull()
  })
})

describe('processCSV — European semicolon CSV with comma decimals', () => {
  it('parses amounts and dot dates correctly', () => {
    const csv = [
      'Date;Description;Amount',
      '23.07.2026;Grocery Store;-45,50',
      '01.01.2026;Salary;3.200,00',
    ].join('\n')
    const result = processCSV(csv, baseMapping, 'acct-1')
    expect(result.skippedCount).toBe(0)
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].amount).toBe(-45.5)
    expect(result.rows[1].amount).toBe(3200)
    expect(result.rows[0].date.toISOString().slice(0, 10)).toBe('2026-07-23')
  })
})
