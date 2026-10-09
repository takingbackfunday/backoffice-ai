import { describe, expect, it } from 'vitest'
import { safeFilename } from './safe-filename'

describe('safeFilename', () => {
  it('keeps only a safe leaf name', () => {
    expect(safeFilename('../../transactions.csv')).toBe('transactions.csv')
    expect(safeFilename('bad\r\nname.csv')).toBe('bad__name.csv')
    expect(safeFilename('')).toBe('bank-import.csv')
  })
})
