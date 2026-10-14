import type { BankConfig } from '@/lib/bank-import/banks'

export type AuthState = 'login' | 'mfa' | 'authenticated' | 'unknown'

export const MFA_PHRASES = [
  'verification code', 'security code', 'one-time', 'confirm your identity', 'verify your identity', 'we sent',
  'sent a code', 'approve', 'confirm in your', 'bestätige', 'bestätigen', 'code eingeben', 'in deiner n26', 'in your n26 app',
]

export function decideAuthState(
  signals: { url: string; passwordVisible: boolean; logoutVisible: boolean; mfaText?: string; mfaVisible?: boolean },
  bank: BankConfig,
): AuthState {
  if (signals.passwordVisible || bank.loginUrlPatterns.some((pattern) => pattern.test(signals.url))) return 'login'
  const text = (signals.mfaText ?? '').toLowerCase()
  if (signals.mfaVisible || MFA_PHRASES.some((phrase) => text.includes(phrase))) return 'mfa'
  if (bank.authenticatedUrlPatterns.some((pattern) => pattern.test(signals.url)) || signals.logoutVisible) return 'authenticated'
  return 'unknown'
}
