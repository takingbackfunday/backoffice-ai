import { createHash } from 'crypto'

/**
 * Generates a SHA-256 hash used to detect duplicate transactions.
 * Based on accountId + date + amount + description to catch exact duplicates
 * from re-imported CSVs. occurrence (0-based) distinguishes genuine repeats of
 * the same transaction within one file; occurrence 0 produces the same hash as
 * before, for backward compatibility.
 */
export function buildDuplicateHash(params: {
  accountId: string
  date: Date | string
  amount: string | number
  description: string
  occurrence?: number
}): string {
  const parts = [
    params.accountId,
    new Date(params.date).toISOString().split('T')[0], // YYYY-MM-DD only
    String(params.amount),
    params.description.trim().toLowerCase(),
  ]
  if (params.occurrence && params.occurrence > 0) parts.push(`#${params.occurrence}`)
  const normalized = parts.join('|')

  return createHash('sha256').update(normalized).digest('hex')
}
