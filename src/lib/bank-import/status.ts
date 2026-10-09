export const BANK_IMPORT_STATUSES = [
  'QUEUED', 'STARTING', 'AWAITING_LOGIN', 'NAVIGATING', 'NEEDS_USER', 'CAPTURED', 'COMPLETE', 'FAILED', 'CANCELLED', 'EXPIRED',
] as const
export type BankImportStatusValue = (typeof BANK_IMPORT_STATUSES)[number]
export type NeedsUserReason = 'login' | 'mfa' | 'takeover' | 'stuck'
export type BankImportCommandType = 'LOGIN_DONE' | 'TAKEOVER' | 'RESUME_AGENT' | 'CANCEL'

export const TERMINAL_STATUSES: ReadonlySet<BankImportStatusValue> = new Set(['COMPLETE', 'FAILED', 'CANCELLED', 'EXPIRED'])
export const BROWSER_LIVE_STATUSES: ReadonlySet<BankImportStatusValue> = new Set(['AWAITING_LOGIN', 'NAVIGATING', 'NEEDS_USER'])
/** "Active" = blocks starting another session. CAPTURED is not active (it waits for review). */
export const ACTIVE_STATUSES: ReadonlySet<BankImportStatusValue> = new Set(['QUEUED', 'STARTING', 'AWAITING_LOGIN', 'NAVIGATING', 'NEEDS_USER'])

const ALLOWED: Record<BankImportStatusValue, BankImportStatusValue[]> = {
  QUEUED: ['STARTING', 'FAILED', 'CANCELLED', 'EXPIRED'],
  STARTING: ['AWAITING_LOGIN', 'FAILED', 'CANCELLED', 'EXPIRED'],
  AWAITING_LOGIN: ['NAVIGATING', 'FAILED', 'CANCELLED', 'EXPIRED'],
  NAVIGATING: ['NEEDS_USER', 'CAPTURED', 'FAILED', 'CANCELLED', 'EXPIRED'],
  NEEDS_USER: ['NAVIGATING', 'CAPTURED', 'FAILED', 'CANCELLED', 'EXPIRED'],
  CAPTURED: ['COMPLETE', 'EXPIRED'],
  COMPLETE: [], FAILED: [], CANCELLED: [], EXPIRED: [],
}

export function canTransition(from: BankImportStatusValue, to: BankImportStatusValue): boolean {
  return ALLOWED[from].includes(to)
}
