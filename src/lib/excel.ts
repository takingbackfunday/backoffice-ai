// Excel ingestion helpers — converts .xlsx/.xls workbooks to CSV text so the
// rest of the upload pipeline (analyzeCsv → column mapper → processCSV) works
// unchanged. Runs client-side (dropzone) and is unit-tested in Node.

import * as XLSX from 'xlsx'

export interface ExcelSheetInfo {
  name: string
  rowCount: number
}

export type Workbook = XLSX.WorkBook

export function readWorkbook(data: ArrayBuffer | Uint8Array): Workbook {
  return XLSX.read(data, { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' })
}

/** Parse a workbook and list its non-empty sheets. */
export function listExcelSheets(data: ArrayBuffer | Uint8Array): ExcelSheetInfo[] {
  return listWorkbookSheets(readWorkbook(data))
}

export function listWorkbookSheets(wb: Workbook): ExcelSheetInfo[] {
  return wb.SheetNames
    .map((name) => {
      const ws = wb.Sheets[name]
      const ref = ws?.['!ref']
      if (!ref) return { name, rowCount: 0 }
      const range = XLSX.utils.decode_range(ref)
      return { name, rowCount: range.e.r - range.s.r + 1 }
    })
    .filter((s) => s.rowCount > 0)
}

/**
 * Convert a single sheet to CSV text.
 * Exports numbers at full stored precision and dates as yyyy-mm-dd.
 */
export function excelSheetToCsv(data: ArrayBuffer | Uint8Array, sheetName: string): string {
  return workbookSheetToCsv(readWorkbook(data), sheetName)
}

export function workbookSheetToCsv(wb: Workbook, sheetName: string): string {
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error(`Sheet "${sheetName}" not found in workbook.`)
  for (const address of Object.keys(ws)) {
    if (address.startsWith('!')) continue
    const cell = ws[address]
    if (cell?.t === 'd') {
      cell.z = 'yyyy-mm-dd'
      delete cell.w
    }
  }
  const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false, rawNumbers: true, dateNF: 'yyyy-mm-dd' })
  if (!csv.trim()) throw new Error(`Sheet "${sheetName}" is empty.`)
  return csv
}
