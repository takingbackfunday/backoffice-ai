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

  it('renders date cells as formatted text, not serial numbers', () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['Date', 'Amount'],
      [new Date(Date.UTC(2026, 0, 15)), 10],
    ])
    ws['A2'].z = 'mm/dd/yyyy'
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const buf = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))

    const csv = excelSheetToCsv(buf, 'Sheet1')
    // Excel serial for 2026-01-15 is ~46037 — must not leak through
    expect(csv).not.toMatch(/46\d{3}/)
    expect(csv).toMatch(/1\/15\/2026|2026-01-15|15\/1\/2026/)
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
