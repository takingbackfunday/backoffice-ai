import type { Workbook } from './excel'

export type OriginalFilePreview =
  | { kind: 'text'; text: string; truncated: boolean }
  | { kind: 'pdf' }
  | { kind: 'excel'; workbook: Workbook }

export async function readOriginalFile(blob: Blob, filename: string, mimeType = blob.type): Promise<OriginalFilePreview> {
  if (blob.size > 20 * 1024 * 1024) throw new Error('Preview is limited to 20 MB. Download the original file instead.')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let extension = filename.toLowerCase().split('.').pop()
  if (!['pdf', 'xlsx', 'xls', 'csv', 'txt'].includes(extension ?? '')) {
    const mime = mimeType.split(';')[0].trim().toLowerCase()
    extension = mime === 'application/pdf' ? 'pdf' : mime === 'text/csv' ? 'csv' : mime === 'text/plain' ? 'txt' :
      mime.includes('spreadsheetml') ? 'xlsx' : mime === 'application/vnd.ms-excel' ? 'xls' : extension
  }
  if (extension === 'pdf') {
    if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new Error('This file is not a valid PDF. Download the original to inspect it.')
    return { kind: 'pdf' }
  }
  if (extension === 'xlsx' || extension === 'xls') {
    try {
      const { readWorkbook } = await import('./excel')
      const workbook = readWorkbook(bytes)
      if (workbook.SheetNames.length === 0) throw new Error('Empty workbook')
      return { kind: 'excel', workbook }
    } catch { throw new Error('Could not preview this workbook. Download the original file instead.') }
  }
  if (extension !== 'csv' && extension !== 'txt') throw new Error('This file type cannot be previewed. Download the original file instead.')
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { text = new TextDecoder('windows-1252').decode(bytes) }
  return { kind: 'text', text: text.slice(0, 200_000), truncated: text.length > 200_000 }
}

export async function readOriginalSheet(workbook: Workbook, sheetName: string): Promise<{ rows: string[][]; startRow: number; truncated: boolean }> {
  const { utils } = await import('xlsx')
  const sheet = workbook.Sheets[sheetName]
  if (!sheet?.['!ref']) return { rows: [], startRow: 1, truncated: false }
  const range = utils.decode_range(sheet['!ref'])
  const endRow = Math.min(range.e.r, range.s.r + 199)
  const endColumn = Math.min(range.e.c, range.s.c + 49)
  const rows = utils.sheet_to_json<string[]>(sheet, {
    header: 1, raw: false, defval: '', blankrows: true,
    range: { s: range.s, e: { r: endRow, c: endColumn } },
  })
  return { rows, startRow: range.s.r + 1, truncated: endRow < range.e.r || endColumn < range.e.c }
}
