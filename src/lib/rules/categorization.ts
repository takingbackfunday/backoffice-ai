export interface TransactionFact {
  description: string
  payeeName: string | null
  amount: number // signed: negative = expense, positive = income
  currency: string
  date: Date
  rawDescription: string
  accountName: string
  notes: string | null
  tags: string[]
}

export interface CategorizationResult {
  categoryName: string
  categoryId: string | null
  payeeId: string | null
  workspaceId: string | null
  notes: string | null        // set notes when rule fires
  addTags: string[]           // tags to append
  confidence: 'high' | 'medium'
  ruleId: string
}
