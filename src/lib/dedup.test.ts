import { describe, it, expect } from 'vitest'
import { buildDuplicateHash } from '@/lib/dedup'

describe('buildDuplicateHash', () => {
  const params = {
    accountId: 'acct-123',
    date: new Date('2024-06-15'),
    amount: -45.50,
    description: 'Starbucks Coffee',
  }

  it('returns a 64-char hex string', () => {
    const hash = buildDuplicateHash(params)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('is deterministic for same inputs', () => {
    const h1 = buildDuplicateHash(params)
    const h2 = buildDuplicateHash(params)
    expect(h1).toBe(h2)
  })

  it('different description produces different hash', () => {
    const h1 = buildDuplicateHash(params)
    const h2 = buildDuplicateHash({ ...params, description: 'Different Store' })
    expect(h1).not.toBe(h2)
  })

  it('different amount produces different hash', () => {
    const h1 = buildDuplicateHash(params)
    const h2 = buildDuplicateHash({ ...params, amount: -45.51 })
    expect(h1).not.toBe(h2)
  })

  it('different date produces different hash', () => {
    const h1 = buildDuplicateHash(params)
    const h2 = buildDuplicateHash({ ...params, date: new Date('2024-06-16') })
    expect(h1).not.toBe(h2)
  })

  it('different accountId produces different hash', () => {
    const h1 = buildDuplicateHash(params)
    const h2 = buildDuplicateHash({ ...params, accountId: 'acct-456' })
    expect(h1).not.toBe(h2)
  })

  it('normalizes description to lowercase and trims', () => {
    const h1 = buildDuplicateHash(params)
    const h2 = buildDuplicateHash({ ...params, description: '  STARBUCKS COFFEE  ' })
    expect(h1).toBe(h2)
  })

  it('normalizes date to YYYY-MM-DD only', () => {
    const h1 = buildDuplicateHash({ ...params, date: new Date('2024-06-15T10:30:00Z') })
    const h2 = buildDuplicateHash({ ...params, date: new Date('2024-06-15T23:59:59Z') })
    expect(h1).toBe(h2)
  })

  it('handles string date input', () => {
    const h1 = buildDuplicateHash({ ...params, date: '2024-06-15' })
    const h2 = buildDuplicateHash({ ...params, date: new Date('2024-06-15') })
    expect(h1).toBe(h2)
  })

  it('snapshot test — known inputs produce known hash', () => {
    const hash = buildDuplicateHash({
      accountId: 'test-account',
      date: '2024-01-01',
      amount: 100,
      description: 'Test Transaction',
    })
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    // Pin the hash so any future change to the algorithm is caught
    expect(hash).toBe('ba9c59f4edb08e1194d93a506854ddc20d17c540f43d4eb392a0cc968d785e7e')
  })
})