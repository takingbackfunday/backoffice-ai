export interface TransactionFact {
  description: string
  merchantName: string | null
  payeeName: string | null
  amount: number // signed: negative = expense, positive = income
  currency: string
  date: Date
  rawDescription: string
}

export interface CategorizationResult {
  categoryName: string
  categoryId: string | null
  merchantName: string | null
  payeeId: string | null
  projectId: string | null
  confidence: 'high' | 'medium'
  ruleId: string
}
