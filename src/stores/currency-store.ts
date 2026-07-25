import { create } from 'zustand'
import type { DashboardCurrency } from '@/lib/currency'
import { DEFAULT_CURRENCY, isDashboardCurrency } from '@/lib/currency'

interface CurrencyStore {
  currency: DashboardCurrency
  hydrated: boolean
  hydrate: (initial?: DashboardCurrency) => Promise<void>
  setCurrency: (c: DashboardCurrency) => void
}

export const useCurrencyStore = create<CurrencyStore>((set, get) => ({
  currency: DEFAULT_CURRENCY,
  hydrated: false,

  hydrate: async (initial?: DashboardCurrency) => {
    if (get().hydrated) return
    if (initial) {
      set({ currency: initial, hydrated: true })
      return
    }
    try {
      const r = await fetch('/api/preferences')
      const res = await r.json()
      const raw = res?.data?.dashboardCurrency
      const next = isDashboardCurrency(raw) ? raw : DEFAULT_CURRENCY
      set({ currency: next, hydrated: true })
    } catch {
      set({ hydrated: true })
    }
  },

  setCurrency: (c: DashboardCurrency) => {
    set({ currency: c, hydrated: true })
    fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dashboardCurrency: c }),
    }).catch(() => {/* non-critical */})
  },
}))
