import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ConnectionsClient } from '@/components/connections/connections-client'

export default async function ConnectionsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const accounts = await prisma.account.findMany({
    where: { userId },
    include: {
      institution: true,
      bankConnection: true,
      bankPlaybook: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  const serialized = accounts.map(a => ({
    id: a.id,
    name: a.name,
    type: a.type,
    institution: { name: a.institution.name },
    bankConnection: a.bankConnection ? {
      id: a.bankConnection.id,
      provider: a.bankConnection.provider,
      status: a.bankConnection.status,
      lastSyncAt: a.bankConnection.lastSyncAt?.toISOString() ?? null,
      disconnectReason: a.bankConnection.disconnectReason,
    } : null,
    hasBankPlaybook: !!a.bankPlaybook,
  }))

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Connections" />
        <main className="flex-1 p-6" role="main">
          <ConnectionsClient accounts={serialized} />
        </main>
      </div>
    </div>
  )
}
