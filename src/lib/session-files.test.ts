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
