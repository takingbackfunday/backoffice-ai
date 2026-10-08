import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { listExcelSheets, excelSheetToCsv } from './excel'

function buildWorkbook(sheets: Record<string, unknown[][]>): Uint8Array {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}

/** Excel 1900-system serial for a UTC calendar date. 2026-01-15 → 46037. */
function serialOf(y: number, m: number, d: number): number {
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000
}

function workbookWithCells(cells: Record<string, { v: number | string; z?: string }>, header: string[]): Uint8Array {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([header, header.map(() => null)])
  for (const [addr, c] of Object.entries(cells)) {
    ws[addr] = typeof c.v === 'number' ? { t: 'n', v: c.v, ...(c.z ? { z: c.z } : {}) } : { t: 's', v: c.v }
  }
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}

describe('listExcelSheets', () => {
  it('lists all sheets with row counts', () => {
    const buf = buildWorkbook({
      Transactions: [['Date', 'Amount'], ['2026-01-01', 10], ['2026-01-02', 20]],
      Summary: [['Total', 30]],
    })
    const sheets = listExcelSheets(buf)
    expect(sheets).toEqual([
      { name: 'Transactions', rowCount: 3 },
      { name: 'Summary', rowCount: 1 },
    ])
  })

  it('omits completely empty sheets', () => {
    const buf = buildWorkbook({
      Data: [['a', 'b'], [1, 2]],
      Empty: [],
    })
    expect(listExcelSheets(buf).map((s) => s.name)).toEqual(['Data'])
  })
})

describe('excelSheetToCsv', () => {
  it('converts the requested sheet to CSV', () => {
    const buf = buildWorkbook({
      Transactions: [
        ['Date', 'Description', 'Amount'],
        ['2026-01-15', 'Coffee, oat milk', -4.5],
        ['2026-01-16', 'Salary', 3000],
      ],
    })
    const csv = excelSheetToCsv(buf, 'Transactions')
    expect(csv).toContain('Date,Description,Amount')
    // comma inside a text cell must be quoted
    expect(csv).toContain('"Coffee, oat milk"')
    expect(csv).toContain('-4.5')
    expect(csv).toContain('3000')
  })

  it('renders date cells as ISO dates, not serial numbers', () => {
    const buf = workbookWithCells({ A2: { v: serialOf(2026, 1, 15), z: 'mm/dd/yyyy' }, B2: { v: 10 } }, ['Date', 'Amount'])
    const csv = excelSheetToCsv(buf, 'Sheet1')
    // Excel serial for 2026-01-15 is ~46037 — must not leak through
    expect(csv).not.toMatch(/46\d{3}/)
    expect(csv).toContain('2026-01-15')
  })

  it('exports the stored numeric value instead of rounded display text', () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([['Amount'], [1234.56]])
    ws['A2'].z = '#,##0'
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const buf = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))

    const csv = excelSheetToCsv(buf, 'Sheet1')
    expect(csv).toContain('1234.56')
    expect(csv).not.toContain('1,235')
  })

  it('exports date cells as yyyy-mm-dd regardless of their display format', () => {
    const buf = workbookWithCells({ A2: { v: serialOf(2026, 1, 15), z: 'm/d/yy' } }, ['Date'])
    expect(excelSheetToCsv(buf, 'Sheet1')).toContain('2026-01-15')
  })

  it('drops time-of-day from date-time cells', () => {
    const buf = workbookWithCells({ A2: { v: serialOf(2026, 1, 15) + 0.75, z: 'yyyy-mm-dd hh:mm' } }, ['Date'])
    const csv = excelSheetToCsv(buf, 'Sheet1')
    expect(csv).toContain('2026-01-15')
    expect(csv).not.toContain('18:00')
  })

  it('reads dates from legacy .xls files', () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([['Date', 'Amount'], [null, null]])
    ws.A2 = { t: 'n', v: serialOf(2026, 1, 15), z: 'mm/dd/yyyy' }
    ws.B2 = { t: 'n', v: 10 }
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const buf = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'biff8' }))
    expect(excelSheetToCsv(buf, 'Sheet1')).toContain('2026-01-15')
  })

  it('reads dates from the 1904 date system', () => {
    const wb = XLSX.utils.book_new()
    wb.Workbook = { WBProps: { date1904: true } }
    const ws = XLSX.utils.aoa_to_sheet([['Date'], [null]])
    const serial = (Date.UTC(2026, 0, 15) - Date.UTC(1904, 0, 1)) / 86_400_000
    ws.A2 = { t: 'n', v: serial, z: 'yyyy-mm-dd' }
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const buf = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))

    expect(excelSheetToCsv(buf, 'Sheet1')).toContain('2026-01-15')
  })

  it('does not treat plain numbers as dates', () => {
    const buf = workbookWithCells({ A2: { v: 46037 } }, ['Amount'])
    expect(excelSheetToCsv(buf, 'Sheet1')).toContain('46037')
  })

  it('skips fully blank rows', () => {
    const buf = buildWorkbook({
      Sheet1: [
        ['Date', 'Amount'],
        ['2026-01-15', 10],
        [null, null],
        ['2026-01-16', 20],
      ],
    })
    const lines = excelSheetToCsv(buf, 'Sheet1').trim().split(/\r?\n/)
    expect(lines).toHaveLength(3)
  })

  it('throws for a missing sheet name', () => {
    const buf = buildWorkbook({ Sheet1: [['a']] })
    expect(() => excelSheetToCsv(buf, 'Nope')).toThrow(/not found/)
  })

  it('throws for an empty sheet', () => {
    const buf = buildWorkbook({ Sheet1: [] })
    expect(() => excelSheetToCsv(buf, 'Sheet1')).toThrow(/empty/)
  })
})
