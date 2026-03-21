import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ExpensesByCategoryWidget } from '@/components/widgets/ExpensesByCategoryWidget'
import { ExpensesByDonutWidget } from '@/components/widgets/ExpensesByDonutWidget'
import { CashflowWidget } from '@/components/widgets/CashflowWidget'
import { NetWorthWidget } from '@/components/widgets/NetWorthWidget'
import { KpiBar } from '@/components/widgets/KpiBar'
import { FinanceQA } from '@/components/dashboard/finance-qa'

export default async function DashboardPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const prefs = await prisma.userPreference.findUnique({ where: { userId } })
  const data = (prefs?.data ?? {}) as Record<string, unknown>
  if (!data.businessType) redirect('/categories')

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Dashboard" />
        <main className="flex-1 p-5 space-y-4 max-w-[1200px]" role="main">
          {/* KPI strip — last full month */}
          <KpiBar />

          {/* 2×2 widget grid: TL expenses bar, TR expenses donut, BL cashflow, BR net worth */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ExpensesByCategoryWidget />
            <ExpensesByDonutWidget />
            <CashflowWidget />
            <NetWorthWidget />
          </div>

          <FinanceQA />
        </main>
      </div>
    </div>
  )
}
