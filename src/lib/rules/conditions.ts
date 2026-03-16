import type { TransactionFact } from './categorization'

export function containsAny(
  accessor: (fact: TransactionFact) => string | null | undefined,
  keywords: string[]
): (fact: TransactionFact) => boolean {
  return (fact) => {
    const value = (accessor(fact) ?? '').toLowerCase()
    return keywords.some((kw) => value.includes(kw.toLowerCase()))
  }
}

export function isExpense(fact: TransactionFact): boolean {
  return fact.amount < 0
}

export function isIncome(fact: TransactionFact): boolean {
  return fact.amount > 0
}

export function allOf(
  ...conditions: ((fact: TransactionFact) => boolean)[]
): (fact: TransactionFact) => boolean {
  return (fact) => conditions.every((c) => c(fact))
}

export function anyOf(
  ...conditions: ((fact: TransactionFact) => boolean)[]
): (fact: TransactionFact) => boolean {
  return (fact) => conditions.some((c) => c(fact))
}
