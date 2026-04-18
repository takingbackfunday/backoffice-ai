import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { DashboardClient } from '@/components/dashboard/dashboard-client'
import { parsePreferences } from '@/types/preferences'
import type { DashboardCurrency } from '@/lib/fx'

const SUPPORTED: DashboardCurrency[] = ['USD', 'EUR', 'GBP']

async function getDefaultCurrency(userId: string): Promise<DashboardCurrency> {
  const earliest = await prisma.account.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { currency: true },
  })
  const c = earliest?.currency?.toUpperCase() ?? 'USD'
  return (SUPPORTED.includes(c as DashboardCurrency) ? c : 'USD') as DashboardCurrency
}

export default async function DashboardPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const prefs = await prisma.userPreference.findUnique({ where: { userId } })
  const data = parsePreferences(prefs?.data)
  if (!data.businessType) redirect('/categories')

  let currency = data.dashboardCurrency
  if (!currency) {
    currency = await getDefaultCurrency(userId)
    // Persist the detected default so subsequent loads skip the account query
    await prisma.userPreference.upsert({
      where: { userId },
      update: { data: { ...(prefs?.data as object ?? {}), dashboardCurrency: currency } as never },
      create: { userId, data: { dashboardCurrency: currency } as never },
    })
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <DashboardClient initialCurrency={currency} />
      </div>
    </div>
  )
}
