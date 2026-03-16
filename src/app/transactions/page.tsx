import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { TransactionTable } from '@/components/transactions/transaction-table'
import { prisma } from '@/lib/prisma'

export default async function TransactionsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const [projects, categoryGroups, payees] = await Promise.all([
    prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.categoryGroup.findMany({
      where: { userId },
      include: { categories: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.payee.findMany({
      where: { userId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Transactions" />
        <main className="flex-1 p-6" role="main">
          <TransactionTable
            userId={userId}
            initialProjects={projects}
            initialCategoryGroups={categoryGroups.map((g) => ({
              id: g.id,
              name: g.name,
              categories: g.categories.map((c) => ({ id: c.id, name: c.name })),
            }))}
            initialPayees={payees}
          />
        </main>
      </div>
    </div>
  )
}
