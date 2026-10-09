import { describe, expect, it } from 'vitest'
import { BANK_IMPORT_STATUSES, canTransition, TERMINAL_STATUSES } from './status'

describe('bank-import status transitions', () => {
  it('allows the normal startup transition and blocks review regressions', () => {
    expect(canTransition('QUEUED', 'STARTING')).toBe(true)
    expect(canTransition('CAPTURED', 'NAVIGATING')).toBe(false)
  })

  it('defines every terminal status as final', () => {
    for (const status of TERMINAL_STATUSES) {
      expect(BANK_IMPORT_STATUSES.includes(status)).toBe(true)
      expect(BANK_IMPORT_STATUSES.filter((next) => canTransition(status, next))).toEqual([])
    }
  })

  it('contains the ten documented states', () => {
    expect(BANK_IMPORT_STATUSES).toHaveLength(10)
  })
})
