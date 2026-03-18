import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { DashboardAnalyzer } from '@/components/dashboard/dashboard-analyzer'
import { ExpensesByCategoryWidget } from '@/components/widgets/ExpensesByCategoryWidget'
import { CashflowWidget } from '@/components/widgets/CashflowWidget'
import { NetWorthWidget } from '@/components/widgets/NetWorthWidget'
import { FinanceQA } from '@/components/dashboard/finance-qa'

export default async function DashboardPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Dashboard" />
        <main className="flex-1 p-6 space-y-6" role="main">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <ExpensesByCategoryWidget />
            <CashflowWidget />
            <NetWorthWidget />
          </div>
          <FinanceQA />
          <DashboardAnalyzer />
        </main>
      </div>
    </div>
  )
}
