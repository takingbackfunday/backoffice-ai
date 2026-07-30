'use client'

import { useEffect } from 'react'
import { DashboardHeader } from './dashboard-header'
import { KpiBar } from '@/components/widgets/KpiBar'
import { DashboardChartsWidget } from '@/components/widgets/DashboardChartsWidget'
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

        {/* Charts widget with shared filter bar */}
        <DashboardChartsWidget currency={currency} />

        <AgentQA />
      </main>
    </>
  )
}
