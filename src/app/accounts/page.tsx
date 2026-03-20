import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { AccountsClient } from '@/components/accounts/accounts-client'

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string }>
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { onboarding } = await searchParams

  const accounts = await prisma.account.findMany({
    where: { userId },
    include: { institution: true },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Accounts" />
        <main className="flex-1 p-6" role="main">
          <AccountsClient
            accounts={accounts.map((a) => ({
              id: a.id,
              name: a.name,
              type: a.type,
              currency: a.currency,
              lastImportAt: a.lastImportAt,
              institution: { name: a.institution.name },
            }))}
            onboarding={onboarding === '1'}
          />
        </main>
      </div>
    </div>
  )
}
