import { evaluateRules } from './engine'
import type { TransactionFact, CategorizationResult } from './categorization'
import type { Rule } from './engine'

export interface CategorizedRow {
  duplicateHash: string
  suggestion: CategorizationResult | null
}

export async function categorizeBatch(
  rows: TransactionFact[],
  userRules: Rule<TransactionFact, CategorizationResult>[] = []
): Promise<Map<string, CategorizationResult | null>> {
  const allRules = [...userRules]

  const results = new Map<string, CategorizationResult | null>()

  for (const row of rows) {
    const matches = evaluateRules(row, allRules, 'first')
    results.set(row.rawDescription + '|' + row.amount + '|' + row.date.toISOString(), matches[0] ?? null)
  }

  return results
}

// Convenience: categorize an array of PreviewRow-shaped objects and return
// the suggestion alongside the original row (keyed by duplicateHash)
export interface CategorizableRow {
  description: string
  merchantName?: string | null
  payeeName?: string | null
  amount: number
  currency?: string
  date: string // ISO string
  duplicateHash: string
}

export function categorizeRows(
  rows: CategorizableRow[],
  userRules: Rule<TransactionFact, CategorizationResult>[] = []
): Array<CategorizableRow & { suggestedCategory: string | null; suggestedCategoryId: string | null; suggestedMerchant: string | null; suggestedPayeeId: string | null; suggestionConfidence: 'high' | 'medium' | null; matchedRuleId: string | null }> {
  const allRules = [...userRules]

  return rows.map((row) => {
    const fact: TransactionFact = {
      description: row.description,
      merchantName: row.merchantName ?? null,
      payeeName: row.payeeName ?? null,
      amount: row.amount,
      currency: row.currency ?? 'USD',
      date: new Date(row.date),
      rawDescription: row.description,
    }

    const matches = evaluateRules(fact, allRules, 'first')
    const match = matches[0] ?? null

    return {
      ...row,
      suggestedCategory: match?.categoryName ?? null,
      suggestedCategoryId: match?.categoryId ?? null,
      suggestedMerchant: match?.merchantName ?? null,
      suggestedPayeeId: match?.payeeId ?? null,
      suggestionConfidence: match?.confidence ?? null,
      matchedRuleId: match?.ruleId ?? null,
    }
  })
}
