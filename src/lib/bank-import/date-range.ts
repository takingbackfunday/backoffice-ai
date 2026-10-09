import type { BankDateFormat } from './banks'

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000
export const MAX_RANGE_DAYS_HARD = 731

export function isIsoDate(s: string): boolean {
  const m = ISO_RE.exec(s)
  if (!m) return false
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  const dt = new Date(Date.UTC(y, mo - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
}

function toUtc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function addDays(iso: string, n: number): string {
  return new Date(toUtc(iso) + n * DAY_MS).toISOString().slice(0, 10)
}

export function daysInclusive(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS) + 1
}

export interface DefaultRange {
  from: string
  to: string
  reason: 'since_last' | 'no_history'
  clamped: boolean
}

export function computeDefaultRange(opts: {
  lastTxnDate: string | null
  today: string
  overlapDays?: number
  noHistoryDays?: number
  maxRangeDays?: number | null
}): DefaultRange {
  const { lastTxnDate, today, overlapDays = 3, noHistoryDays = 90, maxRangeDays = null } = opts
  if (!isIsoDate(today)) throw new Error('today must be YYYY-MM-DD')
  let from: string
  let reason: DefaultRange['reason']
  if (lastTxnDate && isIsoDate(lastTxnDate)) {
    from = addDays(lastTxnDate, -overlapDays)
    if (from > today) from = today
    reason = 'since_last'
  } else {
    from = addDays(today, -(noHistoryDays - 1))
    reason = 'no_history'
  }
  const cap = Math.min(maxRangeDays ?? MAX_RANGE_DAYS_HARD, MAX_RANGE_DAYS_HARD)
  let clamped = false
  if (daysInclusive(from, today) > cap) {
    from = addDays(today, -(cap - 1))
    clamped = true
  }
  return { from, to: today, reason, clamped }
}

export function validateRange(from: string, to: string, today: string, maxRangeDays: number | null): string | null {
  if (!isIsoDate(from) || !isIsoDate(to) || !isIsoDate(today)) return 'Dates must be valid (YYYY-MM-DD).'
  if (from > to) return 'The start date must be on or before the end date.'
  if (to > today) return 'The end date cannot be in the future.'
  const cap = Math.min(maxRangeDays ?? MAX_RANGE_DAYS_HARD, MAX_RANGE_DAYS_HARD)
  if (daysInclusive(from, to) > cap) return `You can fetch at most ${cap} days at once.`
  return null
}

export function formatBankDate(iso: string, format: BankDateFormat | 'ISO'): string {
  const [y, m, d] = iso.split('-')
  if (format === 'MM/DD/YYYY') return `${m}/${d}/${y}`
  if (format === 'DD.MM.YYYY') return `${d}.${m}.${y}`
  if (format === 'DD/MM/YYYY') return `${d}/${m}/${y}`
  return iso
}

export function inferBankDateFormat(hint: string): BankDateFormat | null {
  const normalized = hint.toUpperCase().replace(/\s+/g, '')
  if (normalized.includes('DD/MM/YYYY') || normalized.includes('DD/MM/JJJJ')) return 'DD/MM/YYYY'
  if (normalized.includes('MM/DD/YYYY') || normalized.includes('MM/DD/JJJJ')) return 'MM/DD/YYYY'
  if (normalized.includes('DD.MM.YYYY') || normalized.includes('DD.MM.JJJJ') || normalized.includes('TT.MM.JJJJ')) return 'DD.MM.YYYY'
  return null
}
