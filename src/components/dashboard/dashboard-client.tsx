'use client'

import { useEffect } from 'react'
import { DashboardHeader } from './dashboard-header'
import { KpiBar } from '@/components/widgets/KpiBar'
import { ExpensesByCategoryWidget } from '@/components/widgets/ExpensesByCategoryWidget'
import { ExpensesByDonutWidget } from '@/components/widgets/ExpensesByDonutWidget'
import { CashflowWidget } from '@/components/widgets/CashflowWidget'
import { NetWorthWidget } from '@/components/widgets/NetWorthWidget'
import { AgentQA } from '@/components/dashboard/agent-qa'
import { useCurrencyStore } from '@/stores/currency-store'
import type { DashboardCurrency } from '@/lib/currency'

interface DashboardClientProps {
  initialCurrency: DashboardCurrency
}

export function DashboardClient({ initialCurrency }: DashboardClientProps) {
  const { currency, hydrate } = useCurrencyStore()

  useEffect(() => {
    hydrate(initialCurrency)
  }, [hydrate, initialCurrency])

  return (
    <>
      <DashboardHeader />
      <main className="flex-1 p-4 sm:p-5 space-y-4 max-w-[1200px] w-full" role="main">
        {/* KPI strip — last full month */}
        <KpiBar currency={currency} />

        {/* 2×2 widget grid: TL expenses bar, TR expenses donut, BL cashflow, BR net worth */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ExpensesByCategoryWidget currency={currency} />
          <ExpensesByDonutWidget currency={currency} />
          <CashflowWidget currency={currency} />
          <NetWorthWidget currency={currency} />
        </div>

        <AgentQA />
      </main>
    </>
  )
}
