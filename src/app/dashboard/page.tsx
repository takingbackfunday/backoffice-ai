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
import { AgentQA } from '@/components/dashboard/agent-qa'
import { parsePreferences } from '@/types/preferences'

export default async function DashboardPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const prefs = await prisma.userPreference.findUnique({ where: { userId } })
  const data = parsePreferences(prefs?.data)
  if (!data.businessType) redirect('/categories')

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <Header title="Dashboard" />
        <main className="flex-1 p-4 sm:p-5 space-y-4 max-w-[1200px] w-full" role="main">
          {/* KPI strip — last full month */}
          <KpiBar />

          {/* 2×2 widget grid: TL expenses bar, TR expenses donut, BL cashflow, BR net worth */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ExpensesByCategoryWidget />
            <ExpensesByDonutWidget />
            <CashflowWidget />
            <NetWorthWidget />
          </div>

          <AgentQA />
        </main>
      </div>
    </div>
  )
}
