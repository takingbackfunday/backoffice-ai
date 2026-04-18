'use client'

import { UserButton } from '@clerk/nextjs'
import type { DashboardCurrency } from '@/lib/fx'

const CURRENCIES: { value: DashboardCurrency; symbol: string; label: string }[] = [
  { value: 'USD', symbol: '$', label: 'USD' },
  { value: 'EUR', symbol: '€', label: 'EUR' },
  { value: 'GBP', symbol: '£', label: 'GBP' },
]

interface DashboardHeaderProps {
  currency: DashboardCurrency
  onCurrencyChange: (c: DashboardCurrency) => void
}

export function DashboardHeader({ currency, onCurrencyChange }: DashboardHeaderProps) {
  const current = CURRENCIES.find((c) => c.value === currency) ?? CURRENCIES[0]

  return (
    <header
      className="flex h-14 items-center justify-between border-b px-6"
      data-testid="page-header"
    >
      <h1 className="text-base font-semibold">Dashboard</h1>

      <div className="flex items-center gap-3">
        {/* Currency picker */}
        <div className="flex items-center gap-0.5 rounded-lg border border-black/10 p-0.5 bg-white">
          {CURRENCIES.map((c) => (
            <button
              key={c.value}
              onClick={() => onCurrencyChange(c.value)}
              title={c.label}
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

        <UserButton />
      </div>
    </header>
  )
}
