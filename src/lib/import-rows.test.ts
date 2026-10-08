import { describe, expect, it } from 'vitest'
import { buildDuplicateHash } from './dedup'
import { ImportHashMismatchError, scrubForeignRefs, verifyRowHashes, type ImportRowInput } from './import-rows'

const baseRow: ImportRowInput = {
  date: '2026-01-15T00:00:00.000Z',
  amount: -12.5,
  description: 'Coffee',
  duplicateHash: '',
  rawData: { Description: 'Coffee' },
}

describe('verifyRowHashes', () => {
  it('accepts a matching hash with occurrence 0', () => {
    const row = { ...baseRow, duplicateHash: buildDuplicateHash({ ...baseRow, accountId: 'acct-1' }) }
    expect(() => verifyRowHashes('acct-1', [row])).not.toThrow()
  })

  it('accepts a matching hash with a non-zero occurrence', () => {
    const row = {
      ...baseRow,
      occurrence: 2,
      duplicateHash: buildDuplicateHash({ ...baseRow, accountId: 'acct-1', occurrence: 2 }),
    }
    expect(() => verifyRowHashes('acct-1', [row])).not.toThrow()
  })

  it('rejects a row changed after hashing', () => {
    const row = { ...baseRow, duplicateHash: buildDuplicateHash({ ...baseRow, accountId: 'acct-1' }), amount: -99 }
    expect(() => verifyRowHashes('acct-1', [row])).toThrow(ImportHashMismatchError)
  })
})

describe('scrubForeignRefs', () => {
  it('keeps owned ids, nulls foreign ids, and leaves nulls alone', () => {
    const rows: ImportRowInput[] = [
      { ...baseRow, categoryId: 'owned-category', payeeId: 'owned-payee' },
      { ...baseRow, categoryId: 'foreign-category', payeeId: 'foreign-payee' },
      { ...baseRow, categoryId: null, payeeId: null },
    ]
    const result = scrubForeignRefs(rows, {
      categoryIds: new Set(['owned-category']),
      payeeIds: new Set(['owned-payee']),
    })

    expect(result.rows.map(({ categoryId, payeeId }) => ({ categoryId, payeeId }))).toEqual([
      { categoryId: 'owned-category', payeeId: 'owned-payee' },
      { categoryId: null, payeeId: null },
      { categoryId: null, payeeId: null },
    ])
    expect(result.scrubbed).toBe(2)
  })
})
