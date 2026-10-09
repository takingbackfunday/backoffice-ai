import { describe, expect, it } from 'vitest'
import { isElementDenied, isHostAllowed, isLogoutElement, isPathDenied } from './guardrails'

describe('isHostAllowed', () => {
  it('allows exact and subdomain bank hosts but rejects lookalikes', () => {
    expect(isHostAllowed('https://secure.chase.com/x', ['chase.com'])).toBe(true)
    expect(isHostAllowed('https://chase.com.evil.com', ['chase.com'])).toBe(false)
    expect(isHostAllowed('https://evilchase.com', ['chase.com'])).toBe(false)
  })

  it('requires HTTPS except for explicitly enabled local development', () => {
    expect(isHostAllowed('http://secure.chase.com', ['chase.com'])).toBe(false)
    expect(isHostAllowed('http://localhost:4599/x', ['localhost'], true)).toBe(true)
    expect(isHostAllowed('http://localhost:4599/x', ['localhost'], false)).toBe(false)
    expect(isHostAllowed('javascript:alert(1)', ['localhost'], true)).toBe(false)
  })
})

describe('isPathDenied', () => {
  it.each([
    ['/web/auth/dashboard#/dashboard/payments', true],
    ['/transfer-money', true],
    ['/account/activity', false],
    ['#/dashboard/overview', false],
    ['https://app.n26.com/settings', true],
  ])('%s -> %s', (url, denied) => expect(isPathDenied(url)).toBe(denied))
})

describe('isElementDenied', () => {
  it.each([
    [{ text: 'Download account activity' }, false],
    [{ text: 'Transfer money' }, true],
    [{ text: 'Überweisung' }, true],
    [{ text: 'Umsätze exportieren' }, false],
    [{ text: 'Payment activity' }, false],
    [{ text: 'Pay' }, true],
    [{ text: 'Sign out' }, true],
    [{ text: 'Export', href: '/settings/export' }, true],
  ])('%j navigation decision', (el, denied) => {
    expect(isElementDenied(el, 'navigate').denied).toBe(denied)
  })

  it('allows only sign-out during logout', () => {
    expect(isElementDenied({ text: 'Sign out' }, 'logout').denied).toBe(false)
    expect(isElementDenied({ text: 'Download' }, 'logout').denied).toBe(true)
    expect(isLogoutElement({ ariaLabel: 'Abmelden' })).toBe(true)
  })
})
