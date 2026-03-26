/**
 * Maps provider category labels to our internal category names.
 * Returns null if no mapping exists (caller falls back to rules engine).
 */

const TELLER_MAP: Record<string, string> = {
  accommodation: 'Travel',
  advertising: 'Advertising',
  bar: 'Meals & Entertainment',
  charity: 'Charitable Contributions',
  clothing: 'Clothing',
  dining: 'Meals & Entertainment',
  education: 'Education',
  electronics: 'Equipment',
  entertainment: 'Meals & Entertainment',
  fuel: 'Gas',
  general: '',
  groceries: 'Groceries',
  health: 'Health Insurance',
  home: 'Repairs & Maintenance',
  income: 'Business Income',
  insurance: 'Insurance - Other',
  investment: 'Investment',
  loan: 'Interest Expense',
  office: 'Office Expenses',
  phone: 'Phone',
  service: 'Professional Services',
  shopping: 'Supplies',
  software: 'Software & Subscriptions',
  sport: 'Meals & Entertainment',
  tax: 'Taxes & Licenses',
  transport: 'Transportation',
  transportation: 'Transportation',
  utilities: 'Utilities',
}

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

export function mapProviderCategory(
  provider: 'TELLER' | 'PLAID',
  providerCategory: string | undefined
): string | null {
  if (!providerCategory) return null
  const map = provider === 'TELLER' ? TELLER_MAP : PLAID_MAP
  return map[providerCategory] || null
}
