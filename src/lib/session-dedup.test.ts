import { describe, expect, it } from 'vitest'
import { markSessionDuplicates } from './session-dedup'

describe('markSessionDuplicates', () => {
  it('marks later occurrences of hashes in the session', () => {
    expect(markSessionDuplicates(['a', 'b', 'a', 'c', 'b'])).toEqual([false, false, true, false, true])
  })

  it('handles an empty session', () => {
    expect(markSessionDuplicates([])).toEqual([])
  })
})
