import { describe, it, expect } from 'vitest'
import { addFiles, MAX_FILES } from './session-files'
import { headerSignature } from './import-signature'
import type { UploadFile } from '@/types'

function makeFile(filename: string, headers: string[], source: 'csv' | 'pdf' = 'csv'): UploadFile {
  return { filename, headers, csvText: 'a,b,c', source }
}

const CHASE = ['Date', 'Amount', 'Description']
const WELLS = ['Transaction Date', 'Debit', 'Memo']

describe('addFiles', () => {
  it('accepts first file and sets session signature', () => {
    const result = addFiles([], null, [makeFile('jan.csv', CHASE)])
    expect(result.accepted).toHaveLength(1)
    expect(result.rejected).toHaveLength(0)
  })

  it('accepts files with matching signatures', () => {
    const result = addFiles([], null, [
      makeFile('jan.csv', CHASE),
      makeFile('feb.csv', CHASE),
    ])
    expect(result.accepted).toHaveLength(2)
    expect(result.rejected).toHaveLength(0)
  })

  it('retains the original local File and sheet metadata when accepted', () => {
    const file = new File(['workbook'], 'jan.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const original: UploadFile['original'] = { kind: 'local', file, sheetName: 'Transactions' }
    const uploadFile: UploadFile = { ...makeFile('jan.xlsx', CHASE), source: 'excel', original }

    const result = addFiles([], null, [uploadFile])

    expect(result.accepted).toHaveLength(1)
    expect(result.accepted[0]).toBe(uploadFile)
    expect(result.accepted[0].original).toBe(original)
    expect(result.accepted[0].original).toEqual({ kind: 'local', file, sheetName: 'Transactions' })
    expect(result.accepted[0].csvText).toBe('a,b,c')
  })

  it('retains original bank artifact metadata separately from the upload filename', () => {
    const original: UploadFile['original'] = {
      kind: 'bank',
      sessionId: 'session-1',
      artifactId: 'artifact-1',
      filename: 'transactions.csv',
      mimeType: 'text/csv',
    }
    const uploadFile: UploadFile = { ...makeFile('Chase 2026-01-01 to 2026-01-31.csv', CHASE), original }

    const result = addFiles([], null, [uploadFile])

    expect(result.accepted).toHaveLength(1)
    expect(result.accepted[0]).toBe(uploadFile)
    expect(result.accepted[0].original).toBe(original)
    expect(result.accepted[0].original).toEqual({
      kind: 'bank',
      sessionId: 'session-1',
      artifactId: 'artifact-1',
      filename: 'transactions.csv',
      mimeType: 'text/csv',
    })
    expect(result.accepted[0].filename).toBe('Chase 2026-01-01 to 2026-01-31.csv')
    expect(result.accepted[0].csvText).toBe('a,b,c')
  })

  it('rejects files with different signatures', () => {
    const result = addFiles([], null, [
      makeFile('jan.csv', CHASE),
      makeFile('wells.csv', WELLS),
    ])
    expect(result.accepted).toHaveLength(1)
    expect(result.accepted[0].filename).toBe('jan.csv')
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0].filename).toBe('wells.csv')
    expect(result.rejected[0].reason).toContain('Different columns')
  })

  it('rejects files that do not match the existing session signature', () => {
    const existing = [makeFile('jan.csv', CHASE)]
    const sessionSig = headerSignature(CHASE)
    const result = addFiles(existing, sessionSig, [makeFile('wells.csv', WELLS)])
    expect(result.accepted).toHaveLength(0)
    expect(result.rejected).toHaveLength(1)
  })

  it('rejects duplicate filenames', () => {
    const existing = [makeFile('jan.csv', CHASE)]
    const sessionSig = headerSignature(CHASE)
    const result = addFiles(existing, sessionSig, [makeFile('jan.csv', CHASE)])
    expect(result.accepted).toHaveLength(0)
    expect(result.rejected).toHaveLength(1)
    expect(result.rejected[0].reason).toContain('Already added')
  })

  it('enforces max file cap', () => {
    const files = Array.from({ length: MAX_FILES + 2 }, (_, i) =>
      makeFile(`file-${i}.csv`, CHASE)
    )
    const result = addFiles([], null, files)
    expect(result.accepted).toHaveLength(MAX_FILES)
    expect(result.rejected).toHaveLength(2)
    expect(result.rejected[0].reason).toContain('Maximum')
  })

  it('accepts PDFs (all share the same fixed signature)', () => {
    const pdfHeaders = ['Date (YYYY-MM-DD)', 'Description', 'Amount', 'Notes']
    const result = addFiles([], null, [
      makeFile('jan.pdf', pdfHeaders, 'pdf'),
      makeFile('feb.pdf', pdfHeaders, 'pdf'),
    ])
    expect(result.accepted).toHaveLength(2)
  })

  it('rejects mixed CSV+PDF when signatures differ', () => {
    const pdfHeaders = ['Date (YYYY-MM-DD)', 'Description', 'Amount', 'Notes']
    const result = addFiles([], null, [
      makeFile('jan.csv', CHASE),
      makeFile('feb.pdf', pdfHeaders, 'pdf'),
    ])
    expect(result.accepted).toHaveLength(1)
    expect(result.rejected).toHaveLength(1)
  })
})
