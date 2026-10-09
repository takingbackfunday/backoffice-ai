import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { open, seal } from './secret-box'

describe('secret box', () => {
  beforeEach(() => vi.stubEnv('ENCRYPTION_SECRET', 'test-encryption-secret'))
  afterEach(() => vi.unstubAllEnvs())

  it('seals and opens a value', () => {
    expect(open(seal('short-lived live URL'))).toBe('short-lived live URL')
  })

  it('rejects a tampered ciphertext', () => {
    const sealed = seal('secret')
    const parts = sealed.split('.')
    parts[3] = `${parts[3][0] === 'A' ? 'B' : 'A'}${parts[3].slice(1)}`
    expect(() => open(parts.join('.'))).toThrow()
  })

  it('requires the encryption secret', () => {
    vi.stubEnv('ENCRYPTION_SECRET', '')
    expect(() => seal('secret')).toThrow('ENCRYPTION_SECRET is required')
  })
})
