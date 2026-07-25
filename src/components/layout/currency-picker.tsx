'use client'

import { useEffect } from 'react'
import { useCurrencyStore } from '@/stores/currency-store'
import { CURRENCIES } from '@/lib/currency'

export function CurrencyPicker() {
  const { currency, hydrated, hydrate, setCurrency } = useCurrencyStore()

  useEffect(() => {
    hydrate()
  }, [hydrate])

  return (
    <div
      className={`flex items-center gap-0.5 rounded-lg border border-black/10 p-0.5 bg-white transition-opacity ${
        hydrated ? 'opacity-100' : 'opacity-40'
      }`}
      aria-label="Display currency"
    >
      {CURRENCIES.map((c) => (
        <button
          key={c.value}
          onClick={() => setCurrency(c.value)}
          title={c.label}
          disabled={!hydrated}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
            c.value === currency
              ? 'bg-[#3C3489] text-white'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span>{c.symbol}</span>
          <span>{c.label}</span>
        </button>
      ))}
    </div>
  )
}
