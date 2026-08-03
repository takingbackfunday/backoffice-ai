import { describe, it, expect } from 'vitest'
import { contentWidthClass } from './content-width'

describe('contentWidthClass', () => {
  it('returns "max-w-3xl" for "md"', () => {
    expect(contentWidthClass('md')).toBe('max-w-3xl')
  })

  it('returns "max-w-4xl" for "lg"', () => {
    expect(contentWidthClass('lg')).toBe('max-w-4xl')
  })

  it('returns undefined when called without argument', () => {
    expect(contentWidthClass(undefined)).toBeUndefined()
  })
})
