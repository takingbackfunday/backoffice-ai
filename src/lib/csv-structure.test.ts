import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { analyzeCsv, sniffDelimiter, repairRow, findStatementTotals, type RepairContext } from '@/lib/csv-structure'
import { resolveSplitAmount } from '@/lib/amount'

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name), 'utf8')

describe('sniffDelimiter', () => {
  it('detects comma', () => {
    expect(sniffDelimiter('Date,Description,Amount\n1/2/2026,A,1.00')).toBe(',')
  })

  it('detects semicolon (European exports)', () => {
    expect(sniffDelimiter('"Buchungstag";"Betrag"\n"23.01.2026";"-45,50"')).toBe(';')
  })

  it('detects tab', () => {
    expect(sniffDelimiter('Date\tDescription\tAmount\n1/2/2026\tA\t1.00')).toBe('\t')
  })

  it('detects pipe', () => {
    expect(sniffDelimiter('Date|Description|Amount\n1/2/2026|A|1.00')).toBe('|')
  })

  it('prefers consistent semicolon columns over decimal commas', () => {
    const text = [
      'Date;Description;One;Two;Three',
      '2026-01-01;A;0;12,50;0',
      '2026-01-02;B;12,50;0;3,25',
      '2026-01-03;C;0;1,00;5,00',
    ].join('\n')
    expect(sniffDelimiter(text)).toBe(';')
  })

  it('is not fooled by delimiter-free preamble lines or semicolons in memo text', () => {
    const text = [
      'Statement for account 12345',
      'Date,Description,Amount',
      '1/2/2026,Zelle payment to X for lawn care; Conf# abc,100.00',
      '1/3/2026,Zelle payment to Y; Conf# def,-50.00',
    ].join('\n')
    expect(sniffDelimiter(text)).toBe(',')
  })
})

describe('analyzeCsv — header-region detection', () => {
  it('uses row 0 for a clean file with no preamble', () => {
    const s = analyzeCsv('Date,Description,Amount\n1/2/2026,A,1.00\n1/3/2026,B,2.00\n1/4/2026,C,3.00')
    expect(s.headerIndex).toBe(0)
    expect(s.headers).toEqual(['Date', 'Description', 'Amount'])
    expect(s.preamble).toEqual([])
    expect(s.rows).toHaveLength(3)
    expect(s.headerless).toBe(false)
  })

  it('skips a Chase-style summary preamble and finds the real header row', () => {
    const s = analyzeCsv(fixture('chase-statement-preamble.csv'))
    expect(s.headerless).toBe(false)
    expect(s.headers.slice(0, 4)).toEqual(['Date', 'Description', 'Amount', 'Running Bal.'])
    expect(s.preamble).toHaveLength(5) // summary block incl. the blank-ish row is removed by greedy parsing
    expect(s.rows).toHaveLength(5)
    expect(s.rows[0][0]).toBe('1/1/2026')
  })

  it('handles a German statement preamble over a semicolon grid', () => {
    const s = analyzeCsv(fixture('n26-semicolon-preamble.csv'))
    expect(s.delimiter).toBe(';')
    expect(s.headers).toEqual(['Buchungstag', 'Verwendungszweck', 'Betrag (EUR)'])
    expect(s.rows).toHaveLength(2)
    expect(s.preamble.length).toBeGreaterThan(0)
  })

  it('detects headerless files and synthesises column names', () => {
    const s = analyzeCsv(fixture('headerless-transactions.csv'))
    expect(s.headerless).toBe(true)
    expect(s.headers).toEqual(['Column 1', 'Column 2', 'Column 3'])
    expect(s.rows).toHaveLength(3)
  })
})

describe('repairRow', () => {
  const ctx: RepairContext = {
    headerCount: 6,
    dateIdx: 0,
    amountIdx: 2,
    descIdx: 1,
    delimiter: ',',
    isDate: (v) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v.trim()),
  }

  it('re-joins a description split by an unquoted comma (memo case)', () => {
    // Chase row shape: memo split pushed Amount/Balance one column right
    const fields = ['1/3/2026', 'Zelle payment to John Smith for yard work', ' extra cleanup"; Conf# DEF456"', '-300', '2,700.00', '']
    const repaired = repairRow(fields, ctx)
    expect(repaired).not.toBeNull()
    expect(repaired![0]).toBe('1/3/2026')
    expect(repaired![1]).toContain('yard work')
    expect(repaired![1]).toContain('Conf# DEF456')
    expect(repaired![2]).toBe('-300')
    expect(repaired![3]).toBe('2,700.00')
  })

  it('repairs a description split twice (two unquoted commas)', () => {
    const fields = ['1/4/2026', 'Zelle payment to Bob Jones for Clogged drain', ' clean air handler', '; Conf# GHI789', '-155', '2,545.00']
    const repaired = repairRow(fields, ctx)
    expect(repaired).not.toBeNull()
    expect(repaired![1]).toContain('clean air handler')
    expect(repaired![1]).toContain('Conf# GHI789')
    expect(repaired![2]).toBe('-155')
  })

  it('re-joins a split thousands separator (numeric merge)', () => {
    const c3 = { ...ctx, headerCount: 3, dateIdx: 0, descIdx: 1, amountIdx: 2 }
    const fields = ['1/2/2026', 'Shop', '1', '234.56']
    const repaired = repairRow(fields, c3)
    expect(repaired).not.toBeNull()
    expect(repaired![1]).toBe('Shop')
    expect(repaired![2]).toBe('1,234.56')
  })

  it('refuses to repair a row with an empty typed column (beginning-balance marker)', () => {
    const fields = ['1/1/2026', 'Beginning balance as of 01/01/2026', '', '1,000.00', '', '']
    expect(repairRow(fields, ctx)).toBeNull()
  })

  it('pads short rows (exporter omitted trailing empty columns)', () => {
    const fields = ['1/2/2026', 'Coffee Shop', '-4.50']
    const repaired = repairRow(fields, ctx)
    expect(repaired).toHaveLength(6)
    expect(repaired![2]).toBe('-4.50')
  })

  it('repairs an unquoted description comma in split debit/credit mode', () => {
    const splitCtx: RepairContext = {
      headerCount: 5,
      dateIdx: 0,
      descIdx: 1,
      amountIdx: 2,
      creditIdx: 3,
      delimiter: ',',
      isDate: (v) => /^\d{2}\/\d{2}\/\d{4}$/.test(v.trim()),
    }
    const repaired = repairRow(
      ['03/03/2026', 'Zelle to Bob for drain', ' air handler', '155.00', '', '2545.00'],
      splitCtx,
    )
    expect(repaired).not.toBeNull()
    expect(repaired?.[1]).toBe('Zelle to Bob for drain, air handler')
    expect(repaired?.[2]).toBe('155.00')
    expect(resolveSplitAmount(repaired?.[2], repaired?.[3])).toEqual({ ok: true, amount: -155 })
  })

  it('does not guess when multiple split-row repairs are plausible', () => {
    const splitCtx: RepairContext = {
      headerCount: 5,
      dateIdx: 0,
      descIdx: 1,
      amountIdx: 2,
      creditIdx: 3,
      delimiter: ',',
      isDate: (v) => /^\d{2}\/\d{2}\/\d{4}$/.test(v.trim()),
    }
    expect(repairRow(['03/03/2026', 'Memo', '10', '0', '0', '100'], splitCtx)).toBeNull()
  })
})

describe('findStatementTotals', () => {
  it('extracts declared credit/debit totals from preamble rows', () => {
    const s = analyzeCsv(fixture('chase-statement-preamble.csv'))
    const totals = findStatementTotals(s.preamble)
    expect(totals.credits).toBe(2000)
    expect(totals.debits).toBe(-555)
  })

  it('returns nothing when the preamble declares no totals', () => {
    const s = analyzeCsv(fixture('n26-semicolon-preamble.csv'))
    const totals = findStatementTotals(s.preamble)
    expect(totals.credits).toBeUndefined()
    expect(totals.debits).toBeUndefined()
  })
})
