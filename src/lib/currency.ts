import type { DashboardCurrency } from '@/lib/fx'

export type { DashboardCurrency }

export const CURRENCIES: { value: DashboardCurrency; symbol: string; label: string }[] = [
  { value: 'USD', symbol: '$', label: 'USD' },
  { value: 'EUR', symbol: '€', label: 'EUR' },
  { value: 'GBP', symbol: '£', label: 'GBP' },
]

export const CURRENCY_SYMBOLS: Record<DashboardCurrency, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
}

export const DEFAULT_CURRENCY: DashboardCurrency = 'USD'

export function isDashboardCurrency(s: string | undefined | null): s is DashboardCurrency {
  return s === 'USD' || s === 'EUR' || s === 'GBP'
}
