import { describe, expect, it } from 'vitest'
import { getBank } from '@/lib/bank-import/banks'
import { decideAuthState } from './auth-decide'

const chase = getBank('chase')!
const n26 = getBank('n26')!

describe('decideAuthState', () => {
  it('detects a password form as login', () => {
    expect(decideAuthState({ url: 'https://secure.chase.com/home', passwordVisible: true, logoutVisible: false, mfaText: '' }, chase)).toBe('login')
  })

  it('detects bank authentication from a known URL', () => {
    expect(decideAuthState({ url: 'https://app.n26.com/feed', passwordVisible: false, logoutVisible: false, mfaText: '' }, n26)).toBe('authenticated')
  })

  it('detects app-based multifactor approval', () => {
    expect(decideAuthState({ url: 'https://app.n26.com/confirm', passwordVisible: false, logoutVisible: false, mfaText: 'Approve in your N26 app' }, n26)).toBe('mfa')
  })

  it('uses visible sign-out as an authenticated signal and otherwise stays unknown', () => {
    expect(decideAuthState({ url: 'https://secure.chase.com/home', passwordVisible: false, logoutVisible: true, mfaText: '' }, chase)).toBe('authenticated')
    expect(decideAuthState({ url: 'https://secure.chase.com/home', passwordVisible: false, logoutVisible: false, mfaText: 'Welcome' }, chase)).toBe('unknown')
  })
})
