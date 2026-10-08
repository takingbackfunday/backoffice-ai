/**
 * Shared, format-aware amount parser.
 *
 * Parse an amount string supporting both US (1,234.56) and European
 * (1.234,56 / 1234,56) number formats. When both separators are present the
 * rightmost one is the decimal separator and the other is thousands grouping.
 * A lone comma is a decimal comma unless it groups exactly 3 digits (1,234).
 * Handles (parenthesised), leading +/-, and trailing-minus negatives, and
 * strips $ € £, whitespace, and apostrophe grouping.
 *
 * Re-exported from '@/lib/csv-processor' — existing imports keep working.
 */
export function parseAmount(raw: string, inverted: boolean): number | null {
  let clean = raw?.trim()
  if (!clean) return null

  let negative = false
  const parenMatch = clean.match(/^\((.+)\)$/)
  if (parenMatch) {
    negative = true
    clean = parenMatch[1].trim()
  }

  // Strip currency symbols, whitespace, and apostrophe thousands groups
  clean = clean.replace(/[$€£\s']/g, '')

  if (clean.startsWith('-') || clean.startsWith('+')) {
    if (clean.startsWith('-')) negative = true
    clean = clean.slice(1)
  }
  // Trailing minus (German "Soll" style): 12,50-
  if (clean.endsWith('-')) {
    negative = true
    clean = clean.slice(0, -1)
  }
  if (!clean) return null

  const lastComma = clean.lastIndexOf(',')
  const lastDot = clean.lastIndexOf('.')

  let normalized: string
  if (lastComma > -1 && lastDot > -1) {
    // Both present: the rightmost is the decimal separator
    normalized =
      lastComma > lastDot
        ? clean.replace(/\./g, '').replace(',', '.') // European: 1.234,56
        : clean.replace(/,/g, '') // US: 1,234.56
  } else if (lastComma > -1) {
    const commaCount = clean.split(',').length - 1
    const digitsAfterLast = clean.length - lastComma - 1
    normalized =
      commaCount === 1 && digitsAfterLast !== 3
        ? clean.replace(',', '.') // decimal comma: 12,50
        : clean.replace(/,/g, '') // thousands grouping: 1,234 / 1,234,567
  } else if ((clean.match(/\./g) ?? []).length > 1) {
    normalized = clean.replace(/\./g, '') // European thousands: 1.234.567
  } else {
    normalized = clean // single dot (US decimal) or plain integer
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const n = parseFloat(normalized)
  if (isNaN(n)) return null
  const signed = negative ? -n : n
  return inverted ? -signed : signed
}

export type SplitAmountResult =
  | { ok: true; amount: number }
  | { ok: false; reason: 'empty' }
  | { ok: false; reason: 'both'; debit: string; credit: string }
  | { ok: false; reason: 'invalid'; side: 'debit' | 'credit'; raw: string }

/**
 * Resolve separate money-out and money-in cells without combining amounts.
 * The column determines the sign, regardless of the value's own sign.
 */
export function resolveSplitAmount(rawDebit: string | undefined, rawCredit: string | undefined): SplitAmountResult {
  const debit = rawDebit?.trim() ?? ''
  const credit = rawCredit?.trim() ?? ''
  if (!debit && !credit) return { ok: false, reason: 'empty' }

  const debitValue = debit ? parseAmount(debit, false) : null
  if (debit && debitValue === null) return { ok: false, reason: 'invalid', side: 'debit', raw: debit }
  const creditValue = credit ? parseAmount(credit, false) : null
  if (credit && creditValue === null) return { ok: false, reason: 'invalid', side: 'credit', raw: credit }

  const hasDebit = debitValue !== null && debitValue !== 0
  const hasCredit = creditValue !== null && creditValue !== 0
  if (hasDebit && hasCredit) return { ok: false, reason: 'both', debit, credit }
  if (hasDebit) return { ok: true, amount: -Math.abs(debitValue) }
  if (hasCredit) return { ok: true, amount: Math.abs(creditValue) }
  return { ok: true, amount: 0 }
}
