import type { BankConfig } from '@/lib/bank-import/banks'

export type AuthState = 'login' | 'mfa' | 'authenticated' | 'unknown'

export function decideAuthState(
  signals: { url: string; passwordVisible: boolean; logoutVisible: boolean; mfaText: string },
  bank: BankConfig,
): AuthState {
  if (signals.passwordVisible || bank.loginUrlPatterns.some((pattern) => pattern.test(signals.url))) return 'login'
  if (bank.authenticatedUrlPatterns.some((pattern) => pattern.test(signals.url)) || signals.logoutVisible) return 'authenticated'
  const text = signals.mfaText.toLowerCase()
  if ([
    'verification code', 'security code', 'one-time', 'confirm your identity', 'verify your identity', 'we sent',
    'sent a code', 'approve', 'confirm in your', 'bestätige', 'bestätigen', 'code eingeben', 'in deiner n26', 'in your n26 app',
  ].some((phrase) => text.includes(phrase))) return 'mfa'
  return 'unknown'
}
