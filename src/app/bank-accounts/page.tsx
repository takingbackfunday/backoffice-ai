import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { BankAccountsClient } from '@/components/bank-accounts/bank-accounts-client'

export const metadata = { title: 'Bank Accounts — Backoffice AI' }

export default async function BankAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; onboarding?: string }>
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { tab, onboarding } = await searchParams

  const accounts = await prisma.account.findMany({
    where: { userId },
    include: {
      institution: true,
      bankConnection: true,
      bankPlaybook: {
        select: { id: true, status: true, lastVerifiedAt: true, twoFaType: true },
      },
    },
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
    bankConnection: a.bankConnection ? {
      id: a.bankConnection.id,
      provider: a.bankConnection.provider as 'TELLER' | 'PLAID' | 'BROWSER_AGENT',
      status: a.bankConnection.status as 'ACTIVE' | 'DISCONNECTED' | 'DEGRADED' | 'REVOKED',
      lastSyncAt: a.bankConnection.lastSyncAt?.toISOString() ?? null,
      disconnectReason: a.bankConnection.disconnectReason,
    } : null,
    bankPlaybook: a.bankPlaybook ? {
      id: a.bankPlaybook.id,
      status: a.bankPlaybook.status,
      lastVerifiedAt: a.bankPlaybook.lastVerifiedAt?.toISOString() ?? null,
      twoFaType: a.bankPlaybook.twoFaType,
    } : null,
  }))

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Bank Accounts & Cards" />
        <main className="flex-1 p-6 max-w-4xl" role="main">
          <BankAccountsClient
            accounts={serialized}
            initialTab={(tab as 'accounts' | 'auto-sync' | 'manual-sync') ?? 'accounts'}
            onboarding={onboarding === '1'}
          />
        </main>
      </div>
    </div>
  )
}
