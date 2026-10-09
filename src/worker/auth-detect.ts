import type { Page } from 'playwright-core'
import type { BankConfig } from '@/lib/bank-import/banks'
import { decideAuthState, type AuthState } from './auth-decide'

export type { AuthState } from './auth-decide'

export async function detectAuthState(page: Page, bank: BankConfig): Promise<AuthState> {
  let passwordVisible = false
  let logoutVisible = false
  let mfaText = ''
  const frames = page.frames().slice(0, 6)
  for (const frame of frames) {
    if (frame.isDetached()) continue
    try {
      const signals = await frame.evaluate(() => {
        const visible = (element: Element) => {
          const rect = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
        }
        const password = Array.from(document.querySelectorAll('input[type="password"]')).some(visible)
        const logout = Array.from(document.querySelectorAll('a,button,[role="button"],[role="menuitem"]')).some((element) => {
          if (!visible(element)) return false
          const label = `${element.textContent ?? ''} ${element.getAttribute('aria-label') ?? ''}`.toLowerCase()
          return /sign out|log ?out|abmelden|ausloggen/.test(label)
        })
        return {
          password,
          logout,
          text: document.body?.innerText?.slice(0, 5000) ?? '',
        }
      })
      passwordVisible ||= signals.password
      logoutVisible ||= signals.logout
      if (frame === page.mainFrame()) mfaText = signals.text
    } catch {
      // Ignore frames that detach or reject cross-origin evaluation.
    }
  }
  return decideAuthState({ url: page.url(), passwordVisible, logoutVisible, mfaText }, bank)
}
