import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ReceiptsPageClient } from '@/components/receipts/receipts-page-client'
import { prisma } from '@/lib/prisma'

export const metadata = { title: 'Receipts — Backoffice AI' }

export default async function ReceiptsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const workspaces = await prisma.workspace.findMany({
    where: { userId, type: 'CLIENT', isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Receipts" />
        <main className="flex-1" role="main">
          <ReceiptsPageClient workspaces={workspaces} />
        </main>
      </div>
    </div>
  )
}
