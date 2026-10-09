import { describe, expect, it } from 'vitest'
import { artifactToUploadFile } from './artifact-to-upload-file'

const context = { bankName: 'Chase', dateFrom: '2026-09-01', dateTo: '2026-10-01' }

describe('artifactToUploadFile', () => {
  it('converts UTF-8 CSV and strips a BOM', () => {
    const bytes = new TextEncoder().encode('\uFEFFDate,Description,Amount\n2026-09-01,Coffee,-4.50')
    const result = artifactToUploadFile({ filename: 'bank.csv', mimeType: 'text/csv', bytes }, context)
    expect(result.file?.headers).toEqual(['Date', 'Description', 'Amount'])
    expect(result.file?.csvText.startsWith('\uFEFF')).toBe(false)
    expect(result.file?.source).toBe('csv')
  })

  it('decodes Windows-1252 exports', () => {
    const bytes = Buffer.concat([
      Buffer.from('Date,Description,Note,More\n2026-09-01,', 'ascii'),
      Buffer.from([0xdc]), Buffer.from('berweisung,', 'ascii'),
      Buffer.from([0xf6]), Buffer.from('ffnen,', 'ascii'),
      Buffer.from([0xdf, 0xe4, 0xf6]),
    ])
    const result = artifactToUploadFile({ filename: 'bank.csv', mimeType: 'text/csv', bytes }, context)
    expect(result.file?.csvText).toContain('Überweisung')
  })

  it('reports PDFs as unsupported', () => {
    const result = artifactToUploadFile({ filename: 'statement.pdf', mimeType: 'application/pdf', bytes: new Uint8Array([1, 2, 3]) }, context)
    expect(result.file).toBeNull()
    expect(result.unsupportedReason).toContain('PDF statements')
  })

  it('reports a CSV without a header row', () => {
    const bytes = new TextEncoder().encode('2026-09-01,Coffee,-4.50\n2026-09-02,Market,-12.00')
    const result = artifactToUploadFile({ filename: 'empty.csv', mimeType: 'text/csv', bytes }, context)
    expect(result.file).toBeNull()
    expect(result.unsupportedReason).toContain('header row')
  })
})
