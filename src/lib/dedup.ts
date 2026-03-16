import { createHash } from 'crypto'

/**
 * Generates a SHA-256 hash used to detect duplicate transactions.
 * Based on accountId + date + amount + description to catch exact duplicates
 * from re-imported CSVs.
 */
export function buildDuplicateHash(params: {
  accountId: string
  date: Date | string
  amount: string | number
  description: string
}): string {
  const normalized = [
    params.accountId,
    new Date(params.date).toISOString().split('T')[0], // YYYY-MM-DD only
    String(params.amount),
    params.description.trim().toLowerCase(),
  ].join('|')

  return createHash('sha256').update(normalized).digest('hex')
}
