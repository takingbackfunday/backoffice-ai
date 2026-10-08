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
  // cellDates: false keeps dates as Excel serial numbers (timezone-free);
  // cellNF: true keeps each cell's number format so we can tell which numbers are dates.
  return XLSX.read(data, { type: 'array', cellDates: false, cellNF: true })
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
 * Convert a single sheet to CSV text. Numbers are exported at full stored
 * precision; date-formatted cells become yyyy-mm-dd (timezone-independent).
 */
export function excelSheetToCsv(data: ArrayBuffer | Uint8Array, sheetName: string): string {
  return workbookSheetToCsv(readWorkbook(data), sheetName)
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0')
}

/**
 * Convert an Excel date serial to "yyyy-mm-dd" using SheetJS's pure date-code
 * arithmetic — no JS Date, so the result is the same in every timezone.
 * Time-of-day is dropped (transactions are calendar dates).
 */
function serialToIsoDate(serial: number, date1904: boolean): string | null {
  const p = XLSX.SSF.parse_date_code(serial, { date1904 })
  if (!p || !p.y) return null
  return `${pad(p.y, 4)}-${pad(p.m, 2)}-${pad(p.d, 2)}`
}

export function workbookSheetToCsv(wb: Workbook, sheetName: string): string {
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error(`Sheet "${sheetName}" not found in workbook.`)
  const date1904 = !!wb.Workbook?.WBProps?.date1904
  for (const address of Object.keys(ws)) {
    if (address.startsWith('!')) continue
    const cell = ws[address]
    if (!cell) continue
    const fmt = typeof cell.z === 'string' ? cell.z : undefined
    if (cell.t === 'n' && fmt && XLSX.SSF.is_date(fmt)) {
      const iso = serialToIsoDate(cell.v as number, date1904)
      if (iso) ws[address] = { t: 's', v: iso, w: iso }
    } else if (cell.t === 'd' && cell.v instanceof Date) {
      // Defensive: only reachable if a caller parsed with cellDates: true.
      const d = cell.v
      const iso = `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`
      ws[address] = { t: 's', v: iso, w: iso }
    }
  }
  const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false, rawNumbers: true })
  if (!csv.trim()) throw new Error(`Sheet "${sheetName}" is empty.`)
  return csv
}
