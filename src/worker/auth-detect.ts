import type { Page } from 'playwright-core'
import type { BankConfig } from '@/lib/bank-import/banks'
import { decideAuthState, MFA_PHRASES, type AuthState } from './auth-decide'

export type { AuthState } from './auth-decide'

export async function detectAuthState(page: Page, bank: BankConfig): Promise<AuthState> {
  let passwordVisible = false
  let logoutVisible = false
  let mfaVisible = false
  let detectionFailed = false
  const frames = page.frames().slice(0, 6)
  for (const frame of frames) {
    if (frame.isDetached()) { detectionFailed = true; continue }
    try {
      const signals = await frame.evaluate((mfaPhrases) => {
        let password = false
        let logout = false
        let mfa = false
        const roots: (Document | ShadowRoot)[] = [document]
        let scanned = 0
        // Discover open roots on any host, with a per-frame traversal budget.
        for (let i = 0; i < roots.length && scanned < 5000; i++) {
          const walker = document.createTreeWalker(roots[i], NodeFilter.SHOW_ELEMENT)
          let element: Element | null
          while (scanned < 5000 && (element = walker.nextNode() as Element | null)) {
            scanned++
            if (element.shadowRoot && roots.length < 32) roots.push(element.shadowRoot)
            // Keep this inline: tsx adds a Node-only __name helper to named functions.
            const rect = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            if (!rect.width || !rect.height || style.visibility === 'hidden' || style.display === 'none') continue
            password ||= element.matches('input[type="password"]')
            const label = `${(element as HTMLElement).innerText ?? ''}`.slice(0, 5000) +
              ` ${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('placeholder') ?? ''}`
            const text = label.toLowerCase()
            logout ||= element.matches('a,button,[role="button"],[role="menuitem"]') && /sign out|log ?out|abmelden|ausloggen/.test(text)
            mfa ||= mfaPhrases.some((phrase) => text.includes(phrase))
          }
        }
        return { password, logout, mfa }
      }, MFA_PHRASES)
      passwordVisible ||= signals.password
      logoutVisible ||= signals.logout
      mfaVisible ||= signals.mfa
    } catch {
      detectionFailed = true
    }
  }
  if (detectionFailed || frames.length === 0) return 'unknown'
  return decideAuthState({ url: page.url(), passwordVisible, logoutVisible, mfaVisible }, bank)
}
