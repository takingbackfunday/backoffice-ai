// Excel ingestion helpers — converts .xlsx/.xls workbooks to CSV text so the
// rest of the upload pipeline (analyzeCsv → column mapper → processCSV) works
// unchanged. Runs client-side (dropzone) and is unit-tested in Node.

import * as XLSX from 'xlsx'

export interface ExcelSheetInfo {
  name: string
  rowCount: number
}

/** Parse a workbook and list its non-empty sheets. */
export function listExcelSheets(data: ArrayBuffer | Uint8Array): ExcelSheetInfo[] {
  const wb = XLSX.read(data, { type: 'array' })
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
 * Uses the cells' formatted display text (dates render as "1/15/26", amounts
 * keep their displayed separators) rather than raw serial numbers, so the
 * existing date/amount detection sees values the way the user sees them.
 */
export function excelSheetToCsv(data: ArrayBuffer | Uint8Array, sheetName: string): string {
  const wb = XLSX.read(data, { type: 'array' })
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error(`Sheet "${sheetName}" not found in workbook.`)
  const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false })
  if (!csv.trim()) throw new Error(`Sheet "${sheetName}" is empty.`)
  return csv
}
