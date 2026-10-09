import { describe, expect, it } from 'vitest'
import { redactDigits } from './redact'

describe('redactDigits', () => {
  it('keeps only the last four digits of long digit runs', () => {
    expect(redactDigits('Card 4111 1111 1111 1234')).toBe('Card ••••1234')
  })

  it('does not alter amounts or dates', () => {
    expect(redactDigits('Amount 1,234.56')).toBe('Amount 1,234.56')
    expect(redactDigits('09/11/2026')).toBe('09/11/2026')
  })
})
