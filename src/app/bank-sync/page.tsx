import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { BankSyncPageClient } from '@/components/bank-sync/bank-sync-page-client'
import { prisma } from '@/lib/prisma'

export default async function BankSyncPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const accounts = await prisma.account.findMany({
    where: { userId },
    include: {
      institution: true,
      bankPlaybook: {
        select: {
          id: true,
          status: true,
          lastVerifiedAt: true,
          twoFaType: true,
        }
      }
    },
    orderBy: { name: 'asc' },
  })

  // Serialize dates to ISO strings for client component
  const serializedAccounts = accounts.map(account => ({
    ...account,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
    lastImportAt: account.lastImportAt?.toISOString() ?? null,
    institution: {
      ...account.institution,
      createdAt: account.institution.createdAt.toISOString(),
      updatedAt: account.institution.updatedAt.toISOString(),
    },
    bankPlaybook: account.bankPlaybook ? {
      ...account.bankPlaybook,
      lastVerifiedAt: account.bankPlaybook.lastVerifiedAt?.toISOString() ?? null,
    } : null,
  }))

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Manual Sync" />
        <main className="flex-1 p-6" role="main">
          <BankSyncPageClient accounts={serializedAccounts} />
        </main>
      </div>
    </div>
  )
}