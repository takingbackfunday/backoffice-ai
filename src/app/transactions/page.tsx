import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { TransactionTable } from '@/components/transactions/transaction-table'
import { prisma } from '@/lib/prisma'

const PAGE_SIZE = 200

export default async function TransactionsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const where = { account: { userId } }

  const [projects, categoryGroups, payees, total, transactions] = await Promise.all([
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
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      include: {
        account: { include: { institution: true } },
        project: true,
        categoryRef: { include: { group: true } },
        payee: true,
      },
      orderBy: { date: 'desc' },
      take: PAGE_SIZE,
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
            initialRows={transactions as never}
            initialTotal={total}
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
