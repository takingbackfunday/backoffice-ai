export interface GuardElement { text?: string; ariaLabel?: string; href?: string }
export type GuardPhase = 'navigate' | 'logout'

function parseUrl(url: string, base?: string): URL | null {
  try { return new URL(url, base) } catch { return null }
}

export function isHostAllowed(url: string, suffixes: string[], allowInsecureLocalhost = false): boolean {
  const u = parseUrl(url)
  if (!u) return false
  const host = u.hostname.toLowerCase()
  if (u.protocol === 'http:') {
    if (!(allowInsecureLocalhost && (host === 'localhost' || host === '127.0.0.1'))) return false
  } else if (u.protocol !== 'https:') {
    return false
  }
  return suffixes.some((s) => {
    const sfx = s.toLowerCase()
    return host === sfx || host.endsWith(`.${sfx}`) || (allowInsecureLocalhost && host === '127.0.0.1' && sfx === 'localhost')
  })
}

const DENY_SEGMENTS = new Set([
  'transfer', 'transfers', 'payment', 'payments', 'pay', 'paybill', 'paybills', 'billpay', 'zelle', 'wire', 'wires',
  'sendmoney', 'settings', 'security', 'password', 'passwords', 'beneficiary', 'beneficiaries', 'recipient',
  'recipients', 'payee', 'payees', 'ueberweisung', 'überweisung', 'empfaenger', 'empfänger', 'profile', 'logout', 'signout',
])

/** True when any path/hash segment (or dash-separated part of one) is a denied word. */
export function isPathDenied(url: string, base = 'https://bank.invalid'): boolean {
  const u = parseUrl(url, base)
  if (!u) return false
  const parts = `${u.pathname}/${u.hash}`.toLowerCase().split(/[/#?&=._]+/).filter(Boolean)
  const tokens = parts.flatMap((p) => [p, ...p.split('-'), p.replace(/-/g, '')])
  return tokens.some((t) => DENY_SEGMENTS.has(t))
}

// Unicode-aware word boundaries avoid ASCII-only \b mismatches for German text.
function words(alternatives: string[]): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}])`, 'iu')
}

const DENY_TEXT = words([
  'transfers?', 'transfer money', 'send money', 'send', 'zelle', 'wires?', 'pay', 'pay bills?', 'bill pay',
  'make (?:a )?payment', 'schedule (?:a )?payment', 'pay now', 'add (?:a )?(?:payee|recipient|beneficiary)',
  'überweisung(?:en)?', 'überweisen', 'ueberweisung', 'geld senden', 'senden', 'zahlen', 'empfänger',
  'close (?:this )?account', 'konto schließen', 'konto kündigen', 'delete', 'löschen', 'remove', 'entfernen',
  'lock card', 'karte sperren', 'freeze', 'change password', 'passwort ändern', 'settings', 'einstellungen',
  'security', 'sicherheit', 'invest(?:ing)?', 'trade', 'crypto', 'krypto', 'apply now', 'open (?:an|a new) account',
  'sign out', 'log ?out', 'abmelden', 'ausloggen',
])
const LOGOUT_TEXT = words(['sign out', 'log ?out', 'abmelden', 'ausloggen'])

export function isLogoutElement(el: GuardElement): boolean {
  return LOGOUT_TEXT.test(`${el.text ?? ''} ${el.ariaLabel ?? ''}`)
}

export function isElementDenied(el: GuardElement, phase: GuardPhase): { denied: boolean; reason?: string } {
  const label = `${el.text ?? ''} ${el.ariaLabel ?? ''}`.trim()
  if (phase === 'logout') {
    return isLogoutElement(el) ? { denied: false } : { denied: true, reason: 'only sign-out is allowed now' }
  }
  if (el.href && isPathDenied(el.href)) return { denied: true, reason: 'link leads to a blocked area' }
  if (DENY_TEXT.test(label)) return { denied: true, reason: 'blocked action (payments, transfers, settings or sign-out)' }
  return { denied: false }
}
