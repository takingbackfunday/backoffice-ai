/**
 * Maps provider category labels to our internal category names.
 * Returns null if no mapping exists (caller falls back to rules engine).
 */

const PLAID_MAP: Record<string, string> = {
  INCOME: 'Business Income',
  TRANSFER_IN: 'Transfers',
  TRANSFER_OUT: 'Transfers',
  LOAN_PAYMENTS: 'Interest Expense',
  BANK_FEES: 'Bank Charges',
  ENTERTAINMENT: 'Meals & Entertainment',
  FOOD_AND_DRINK: 'Meals & Entertainment',
  GENERAL_MERCHANDISE: 'Supplies',
  HOME_IMPROVEMENT: 'Repairs & Maintenance',
  MEDICAL: 'Health Insurance',
  PERSONAL_CARE: 'Personal',
  GENERAL_SERVICES: 'Professional Services',
  GOVERNMENT_AND_NON_PROFIT: 'Taxes & Licenses',
  TRANSPORTATION: 'Transportation',
  TRAVEL: 'Travel',
  RENT_AND_UTILITIES: 'Utilities',
}

// Enable Banking uses ISO 20022 bank transaction codes
const ENABLE_BANKING_MAP: Record<string, string> = {
  PMNT: 'Transfers',
  CAMT: 'Transfers',
  FEES: 'Bank Charges',
  SALA: 'Business Income',
  DIVD: 'Business Income',
  TAXS: 'Taxes & Licenses',
  SECU: 'Investment',
  LDAS: 'Interest Expense',
}

export function mapProviderCategory(
  provider: 'PLAID' | 'ENABLE_BANKING',
  providerCategory: string | undefined
): string | null {
  if (!providerCategory) return null
  const map = provider === 'PLAID' ? PLAID_MAP : ENABLE_BANKING_MAP
  return map[providerCategory] || null
}
