import { describe, expect, it } from 'vitest'
import { localToday } from './local-date'

describe('localToday', () => {
  it('formats using local calendar fields', () => {
    const date = new Date(2026, 9, 8, 23, 30)
    expect(localToday(date)).toBe('2026-10-08')
  })
})
