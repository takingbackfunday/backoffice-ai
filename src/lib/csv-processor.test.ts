import { describe, it, expect } from 'vitest'
import { processCSV, type CsvMapping } from '@/lib/csv-processor'

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
