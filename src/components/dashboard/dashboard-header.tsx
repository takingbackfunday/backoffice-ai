'use client'

import { UserButton } from '@clerk/nextjs'
import { CurrencyPicker } from '@/components/layout/currency-picker'

export function DashboardHeader() {
  return (
    <header
      className="flex h-14 items-center justify-between border-b px-6"
      data-testid="page-header"
    >
      <h1 className="text-base font-semibold">Dashboard</h1>

      <div className="flex items-center gap-3">
        <CurrencyPicker />
        <UserButton />
      </div>
    </header>
  )
}
