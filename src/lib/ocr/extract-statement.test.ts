import { describe, it, expect } from 'vitest'
import { parseStatementRows, StatementParseError } from '@/lib/ocr/extract-statement'

describe('parseStatementRows', () => {
  it('parses a clean JSON response', () => {
    const raw = JSON.stringify({
      transactions: [
        { date: '2024-06-01', description: 'STARBUCKS COFFEE', amount: -4.5, notes: null },
        { date: '2024-06-02', description: 'SALARY ACME LTD', amount: 3200, notes: 'REF 123' },
      ],
    })
    const rows = parseStatementRows(raw)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ date: '2024-06-01', description: 'STARBUCKS COFFEE', amount: -4.5, notes: null })
    expect(rows[1].notes).toBe('REF 123')
  })

  it('strips markdown fences', () => {
    const raw = '```json\n{"transactions":[{"date":"2024-06-01","description":"SHOP","amount":-10,"notes":null}]}\n```'
    expect(parseStatementRows(raw)).toHaveLength(1)
  })

  it('extracts JSON embedded in prose', () => {
    const raw = 'Here are the transactions:\n{"transactions":[{"date":"2024-06-01","description":"SHOP","amount":-10,"notes":null}]}\nDone.'
    expect(parseStatementRows(raw)).toHaveLength(1)
  })

  it('throws StatementParseError on invalid JSON', () => {
    expect(() => parseStatementRows('not json at all')).toThrow(StatementParseError)
  })

  it('throws StatementParseError when transactions is not an array', () => {
    expect(() => parseStatementRows('{"transactions": "none"}')).toThrow(StatementParseError)
  })

  it('returns [] for a valid response with no transactions', () => {
    expect(parseStatementRows('{"transactions": []}')).toEqual([])
  })

  it('skips rows with invalid dates', () => {
    const raw = JSON.stringify({
      transactions: [
        { date: '01/06/2024', description: 'BAD DATE', amount: -1, notes: null },
        { date: '2024-06-01', description: 'GOOD', amount: -2, notes: null },
      ],
    })
    const rows = parseStatementRows(raw)
    expect(rows).toHaveLength(1)
    expect(rows[0].description).toBe('GOOD')
  })

  it('skips rows with empty description or non-numeric amount', () => {
    const raw = JSON.stringify({
      transactions: [
        { date: '2024-06-01', description: '  ', amount: -1, notes: null },
        { date: '2024-06-01', description: 'BAD AMOUNT', amount: 'abc', notes: null },
        { date: '2024-06-01', description: 'GOOD', amount: -2, notes: null },
      ],
    })
    expect(parseStatementRows(raw)).toHaveLength(1)
  })

  it('coerces numeric string amounts', () => {
    const raw = JSON.stringify({
      transactions: [{ date: '2024-06-01', description: 'SHOP', amount: '-12.50', notes: null }],
    })
    expect(parseStatementRows(raw)[0].amount).toBe(-12.5)
  })

  it('coerces European-format string amounts', () => {
    const raw = JSON.stringify({
      transactions: [
        { date: '2024-06-01', description: 'SHOP', amount: '-12,50', notes: null },
        { date: '2024-06-01', description: 'SALARY', amount: '3.200,00', notes: null },
      ],
    })
    const rows = parseStatementRows(raw)
    expect(rows[0].amount).toBe(-12.5)
    expect(rows[1].amount).toBe(3200)
  })

  it('normalizes blank notes to null', () => {
    const raw = JSON.stringify({
      transactions: [{ date: '2024-06-01', description: 'SHOP', amount: -1, notes: '   ' }],
    })
    expect(parseStatementRows(raw)[0].notes).toBeNull()
  })

  it('skips non-object entries', () => {
    const raw = JSON.stringify({ transactions: [null, 'junk', { date: '2024-06-01', description: 'OK', amount: 5, notes: null }] })
    expect(parseStatementRows(raw)).toHaveLength(1)
  })
})
