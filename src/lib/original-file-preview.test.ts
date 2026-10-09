import { describe, it, expect, vi } from 'vitest'
import * as XLSX from 'xlsx'
import { readOriginalFile, readOriginalSheet } from './original-file-preview'

describe('readOriginalFile', () => {
  it.each(['', '\uFEFF'])('preserves raw CSV text and source bytes with BOM %j', async (bom) => {
    const text = 'Account summary\r\nOpening balance,100\r\n\r\nDate,Description,Amount\r\n2026-01-15,"Coffee, oat milk",-4.50\r\n'
    const bytes = new TextEncoder().encode(bom + text)
    const blob = new Blob([bytes], { type: 'text/csv' })

    expect(await readOriginalFile(blob, 'statement.csv')).toEqual({ kind: 'text', text, truncated: false })
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes)
  })

  it('decodes UTF-8 Unicode including a legitimate replacement character without falling back', async () => {
    const text = 'Caf\u00e9,\u20ac,\u6771\u4eac,\uD83D\uDE00,\uFFFD\r\n'
    expect(await readOriginalFile(new Blob([text]), 'unicode.txt')).toEqual({ kind: 'text', text, truncated: false })
  })

  it('falls back to Windows-1252 for a single invalid UTF-8 byte', async () => {
    const bytes = new Uint8Array([...new TextEncoder().encode('Description,Amount\r\nCaf'), 0xe9, ...new TextEncoder().encode(',12\r\n')])
    expect(await readOriginalFile(new Blob([bytes]), 'statement.csv')).toEqual({
      kind: 'text', text: 'Description,Amount\r\nCaf\u00e9,12\r\n', truncated: false,
    })
  })

  it.each([
    ['statement.CSV', 'application/pdf', undefined],
    ['notes.TXT', 'application/octet-stream', undefined],
    ['sanitized_statement_csv', 'application/octet-stream', ' Text/CSV ; charset=UTF-8 '],
    ['truncated.cs', 'application/octet-stream', ' TEXT/PLAIN ; charset=UTF-8 '],
    ['download', 'text/csv; charset=utf-8', undefined],
  ])('detects text for %s using normalized extension or MIME fallback', async (filename, blobMime, mimeType) => {
    const text = 'Description,Amount\r\nCoffee,12\r\n'
    const blob = new Blob([text], { type: blobMime })
    expect(await readOriginalFile(blob, filename, mimeType)).toEqual({ kind: 'text', text, truncated: false })
  })

  it('returns malicious HTML and escaped entities literally without executing them', async () => {
    const text = '<script>throw new Error("executed")</script><img src=x onerror="throw new Error(\'executed\')">&lt;script&gt;&amp;'
    expect(await readOriginalFile(new Blob([text], { type: 'text/html' }), 'malicious.txt')).toEqual({
      kind: 'text', text, truncated: false,
    })
  })

  it.each([
    ['statement.PDF', 'text/html', undefined, '<html><script>alert(1)</script></html>'],
    ['download', 'application/pdf', undefined, '<html>not a PDF</html>'],
    ['sanitized_pdf', 'application/octet-stream', ' Application/PDF ; version=1.7 ', 'not a PDF'],
    ['statement.pdf', 'application/pdf', undefined, '%PDF'],
    ['statement.pdf', 'application/pdf', undefined, 'prefix%PDF-1.7'],
  ])('requires leading PDF magic for %s (%s, %s, %s)', async (filename, blobMime, mimeType, text) => {
    await expect(readOriginalFile(new Blob([text], { type: blobMime }), filename, mimeType))
      .rejects.toThrow('This file is not a valid PDF.')
  })

  it.each([
    ['statement.PDF', 'text/html', undefined],
    ['truncated.pd', 'application/octet-stream', ' Application/PDF ; version=1.7 '],
  ])('accepts PDF magic for %s and preserves its bytes despite misleading Blob MIME', async (filename, blobMime, mimeType) => {
    const bytes = new Uint8Array([...new TextEncoder().encode('%PDF-1.7\n'), 0x00, 0xff, 0x80, ...new TextEncoder().encode('\n%%EOF')])
    const blob = new Blob([bytes], { type: blobMime })
    expect(await readOriginalFile(blob, filename, mimeType)).toEqual({ kind: 'pdf' })
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes)
  })

  it('rejects unsupported files', async () => {
    await expect(readOriginalFile(new Blob(['<html>text</html>'], { type: 'text/html' }), 'page.html'))
      .rejects.toThrow('This file type cannot be previewed.')
  })

  it('accepts a file at exactly 20 MB', async () => {
    const blob = new Blob(['%PDF-', new Uint8Array(20 * 1024 * 1024 - 5)])
    expect(await readOriginalFile(blob, 'statement.pdf')).toEqual({ kind: 'pdf' })
  })

  it('rejects files over 20 MB before reading their bytes', async () => {
    const blob = new Blob([new Uint8Array(20 * 1024 * 1024 + 1)])
    const readBytes = vi.spyOn(blob, 'arrayBuffer')
    await expect(readOriginalFile(blob, 'statement.csv')).rejects.toThrow('Preview is limited to 20 MB.')
    expect(readBytes).not.toHaveBeenCalled()
  })

  it.each([[200_000, false], [200_001, true]] as const)('clips %i characters with truncated=%s', async (length, truncated) => {
    const text = 'x'.repeat(length - 1) + 'Z'
    expect(await readOriginalFile(new Blob([text]), 'large.txt')).toEqual({
      kind: 'text', text: text.slice(0, 200_000), truncated,
    })
  })

  it.each([
    ['statement.XLSX', 'xlsx', undefined],
    ['statement.XLS', 'biff8', undefined],
    ['sanitized_xlsx', 'xlsx', ' Application/Vnd.Openxmlformats-Officedocument.Spreadsheetml.Sheet ; charset=binary '],
    ['truncated.xl', 'biff8', ' Application/Vnd.Ms-Excel '],
  ] as const)('retains all workbook sheets and original date formats for %s', async (filename, bookType, mimeType) => {
    const workbook = XLSX.utils.book_new()
    const transactions = XLSX.utils.aoa_to_sheet([['Date', 'Amount'], [46037, 1234.56]])
    transactions.A2.z = 'dd/mm/yyyy'
    transactions.B2.z = '#,##0.00'
    const summary = XLSX.utils.aoa_to_sheet([[46037]])
    summary.A1.z = 'yyyy-mm-dd hh:mm'
    XLSX.utils.book_append_sheet(workbook, transactions, 'Transactions')
    XLSX.utils.book_append_sheet(workbook, summary, 'Summary')
    const bytes = XLSX.write(workbook, { type: 'array', bookType }) as ArrayBuffer
    const preview = await readOriginalFile(new Blob([bytes], { type: 'application/octet-stream' }), filename, mimeType)

    expect(preview.kind).toBe('excel')
    if (preview.kind !== 'excel') throw new Error('Expected workbook preview')
    expect(preview.workbook.SheetNames).toEqual(['Transactions', 'Summary'])
    expect(await readOriginalSheet(preview.workbook, 'Summary')).toEqual({
      rows: [['2026-01-15 00:00']], startRow: 1, truncated: false,
    })
    expect(preview.workbook.Sheets.Transactions.A2).toMatchObject({ t: 'n', v: 46037, z: 'dd/mm/yyyy' })
    expect(preview.workbook.Sheets.Transactions.B2).toMatchObject({ t: 'n', v: 1234.56, z: '#,##0.00' })
    expect(preview.workbook.Sheets.Summary.A1).toMatchObject({ t: 'n', v: 46037, z: 'yyyy-mm-dd hh:mm' })
  })
})

describe('readOriginalSheet', () => {
  it('reads the requested sheet with formatted cells, blank rows, and its original row offset', async () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Wrong sheet']]), 'Decoy')
    const sheet = XLSX.utils.aoa_to_sheet([])
    XLSX.utils.sheet_add_aoa(sheet, [
      ['Date', 'Amount', 'Memo', 'Posted'],
      [46037, 1234.56, null, true],
      [],
      ['Footer'],
    ], { origin: 'C7' })
    sheet['!ref'] = 'C7:F10'
    sheet.C8.z = 'dd/mm/yyyy'
    sheet.D8.z = '#,##0.00'
    XLSX.utils.book_append_sheet(workbook, sheet, 'Statement')

    expect(await readOriginalSheet(workbook, 'Statement')).toEqual({
      rows: [
        ['Date', 'Amount', 'Memo', 'Posted'],
        ['15/01/2026', '1,234.56', '', 'TRUE'],
        ['', '', '', ''],
        ['Footer', '', '', ''],
      ],
      startRow: 7, truncated: false,
    })
    expect(sheet.C8).toMatchObject({ t: 'n', v: 46037, z: 'dd/mm/yyyy' })
  })

  it.each([
    [200, 50, false],
    [201, 50, true],
    [200, 51, true],
    [201, 51, true],
  ] as const)('bounds a %i-row, %i-column sheet with truncated=%s', async (rowCount, columnCount, truncated) => {
    const rows = Array.from({ length: rowCount }, (_, row) =>
      Array.from({ length: columnCount }, (_, column) => `${row + 7}:${column + 3}`))
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([])
    XLSX.utils.sheet_add_aoa(sheet, rows, { origin: 'C7' })
    sheet['!ref'] = XLSX.utils.encode_range({ s: { r: 6, c: 2 }, e: { r: rowCount + 5, c: columnCount + 1 } })
    XLSX.utils.book_append_sheet(workbook, sheet, 'Statement')

    expect(await readOriginalSheet(workbook, 'Statement')).toEqual({
      rows: rows.slice(0, 200).map((row) => row.slice(0, 50)), startRow: 7, truncated,
    })
  })

  it('returns an empty preview for an empty sheet', async () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), 'Empty')
    expect(await readOriginalSheet(workbook, 'Empty')).toEqual({ rows: [], startRow: 1, truncated: false })
  })
})
