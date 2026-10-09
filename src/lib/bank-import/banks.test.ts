import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBank, isFakeBankEnabled, resolveBankKey } from './banks'

afterEach(() => vi.unstubAllEnvs())

describe('bank configuration', () => {
  it('maps Chase and N26 institution names case-insensitively', () => {
    expect(resolveBankKey('Chase Checking')).toBe('chase')
    expect(resolveBankKey(' chase credit card ')).toBe('chase')
    expect(resolveBankKey('N26')).toBe('n26')
    expect(resolveBankKey('n26 account')).toBe('n26')
    expect(resolveBankKey('Chasey')).toBeNull()
    expect(resolveBankKey('Other Bank')).toBeNull()
  })

  it('provides the expected bank-specific configuration', () => {
    expect(getBank('chase')).toMatchObject({ region: 'us', proxyCountryCode: 'us', askAccountHint: true })
    expect(getBank('n26')).toMatchObject({ region: 'eu', proxyCountryCode: 'de', askAccountHint: false })
    expect(getBank('unknown')).toBeNull()
  })

  it('enables the fake bank only outside production behind its flag', () => {
    vi.stubEnv('BANK_IMPORT_FAKEBANK', '1')
    vi.stubEnv('NODE_ENV', 'test')
    expect(isFakeBankEnabled()).toBe(true)
    expect(resolveBankKey('Fake Bank')).toBe('fakebank')
    expect(getBank('fakebank')?.loginUrl).toBe('http://localhost:4599/login')

    vi.stubEnv('NODE_ENV', 'production')
    expect(isFakeBankEnabled()).toBe(false)
    expect(getBank('fakebank')).toBeNull()
  })
})
