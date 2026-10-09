import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { bankImportEnabledForUser } from '@/lib/bank-import/flags'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { BankAccountsClient } from '@/components/bank-accounts/bank-accounts-client'

export const metadata = { title: 'Bank Accounts — Backoffice AI' }

export default async function BankAccountsPage({
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

  const serialized = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    currency: a.currency,
    lastImportAt: a.lastImportAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    institution: { name: a.institution.name },
  }))

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Bank Accounts & Cards" />
        <main className="flex-1 p-6 max-w-4xl" role="main">
          <BankAccountsClient
            accounts={serialized}
            onboarding={onboarding === '1'}
            bankImportEnabled={bankImportEnabledForUser(userId)}
          />
        </main>
      </div>
    </div>
  )
}
