import { describe, it, expect, vi } from 'vitest'
import { confirmLeaveWithChanges, UNSAVED_INVOICE_MESSAGE } from './unsaved-guard'

describe('confirmLeaveWithChanges', () => {
  it('returns true immediately when not dirty, does not call confirmFn', () => {
    const confirmFn = vi.fn()
    const result = confirmLeaveWithChanges(false, confirmFn)
    expect(result).toBe(true)
    expect(confirmFn).not.toHaveBeenCalled()
  })

  it('returns true when dirty and confirmFn returns true', () => {
    const confirmFn = vi.fn().mockReturnValue(true)
    const result = confirmLeaveWithChanges(true, confirmFn)
    expect(result).toBe(true)
    expect(confirmFn).toHaveBeenCalledTimes(1)
    expect(confirmFn).toHaveBeenCalledWith(UNSAVED_INVOICE_MESSAGE)
  })

  it('returns false when dirty and confirmFn returns false', () => {
    const confirmFn = vi.fn().mockReturnValue(false)
    const result = confirmLeaveWithChanges(true, confirmFn)
    expect(result).toBe(false)
    expect(confirmFn).toHaveBeenCalledTimes(1)
    expect(confirmFn).toHaveBeenCalledWith(UNSAVED_INVOICE_MESSAGE)
  })
})
