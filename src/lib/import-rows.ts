import { buildDuplicateHash } from './dedup'

export interface ImportRowInput {
  date: string
  amount: number
  description: string
  notes?: string | null
  category?: string | null
  categoryId?: string | null
  payeeId?: string | null
  duplicateHash: string
  occurrence?: number
  rawData: Record<string, string>
}

export class ImportHashMismatchError extends Error {
  constructor() {
    super('Import data is out of date — please refresh the preview.')
    this.name = 'ImportHashMismatchError'
  }
}

/** Recompute every row's hash server-side; throws if any client hash differs. */
export function verifyRowHashes(accountId: string, rows: ImportRowInput[]): void {
  for (const r of rows) {
    const expected = buildDuplicateHash({
      accountId,
      date: r.date,
      amount: r.amount,
      description: r.description,
      occurrence: r.occurrence ?? 0,
    })
    if (expected !== r.duplicateHash) throw new ImportHashMismatchError()
  }
}

/**
 * Null out category/payee ids the user does not own so an import can never
 * link to another tenant's records. Returns the cleaned rows and how many refs were dropped.
 */
export function scrubForeignRefs<T extends ImportRowInput>(
  rows: T[],
  owned: { categoryIds: Set<string>; payeeIds: Set<string> }
): { rows: T[]; scrubbed: number } {
  let scrubbed = 0
  const cleaned = rows.map((r) => {
    let categoryId = r.categoryId ?? null
    let payeeId = r.payeeId ?? null
    if (categoryId && !owned.categoryIds.has(categoryId)) { categoryId = null; scrubbed++ }
    if (payeeId && !owned.payeeIds.has(payeeId)) { payeeId = null; scrubbed++ }
    return { ...r, categoryId, payeeId }
  })
  return { rows: cleaned, scrubbed }
}
