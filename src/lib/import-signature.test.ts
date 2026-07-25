import { describe, it, expect } from 'vitest'
import { headerSignature } from './import-signature'

describe('headerSignature', () => {
  it('produces a 64-char hex string', () => {
    const sig = headerSignature(['Date', 'Amount', 'Description'])
    expect(sig).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic for the same headers', () => {
    const a = headerSignature(['Date', 'Amount', 'Description'])
    const b = headerSignature(['Date', 'Amount', 'Description'])
    expect(a).toBe(b)
  })

  it('is column-order independent (sorts before hashing)', () => {
    const a = headerSignature(['Date', 'Amount', 'Description'])
    const b = headerSignature(['Description', 'Date', 'Amount'])
    expect(a).toBe(b)
  })

  it('is case-insensitive', () => {
    const a = headerSignature(['Date', 'Amount', 'Description'])
    const b = headerSignature(['date', 'AMOUNT', 'DeScRiPtIoN'])
    expect(a).toBe(b)
  })

  it('is whitespace-insensitive', () => {
    const a = headerSignature(['Date', 'Amount', 'Description'])
    const b = headerSignature(['  Date  ', '\tAmount', ' Description '])
    expect(a).toBe(b)
  })

  it('produces different signatures for different header sets', () => {
    const a = headerSignature(['Date', 'Amount', 'Description'])
    const b = headerSignature(['Date', 'Amount', 'Description', 'Notes'])
    expect(a).not.toBe(b)
  })

  it('handles a single header', () => {
    const sig = headerSignature(['Amount'])
    expect(sig).toMatch(/^[0-9a-f]{64}$/)
  })

  it('produces a fixed signature for the known PDF synthesized schema', () => {
    const pdfHeaders = ['Date (YYYY-MM-DD)', 'Description', 'Amount', 'Notes']
    const a = headerSignature(pdfHeaders)
    const b = headerSignature([...pdfHeaders].reverse())
    expect(a).toBe(b)
  })
})
