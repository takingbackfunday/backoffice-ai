import { describe, expect, it } from 'vitest'
import { mimeFromFilename } from './mime'

describe('mimeFromFilename', () => {
  it.each([
    ['transactions.csv', 'text/csv'],
    ['statement.TXT', 'text/plain'],
    ['export.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['export.xls', 'application/vnd.ms-excel'],
    ['statement.pdf', 'application/pdf'],
    ['file.unknown', 'application/octet-stream'],
  ])('%s -> %s', (name, expected) => expect(mimeFromFilename(name)).toBe(expected))
})
