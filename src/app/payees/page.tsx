import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { PayeeManager } from '@/components/payees/payee-manager'
import { prisma } from '@/lib/prisma'

export default async function PayeesPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const [payees, groups] = await Promise.all([
    prisma.payee.findMany({
      where: { userId },
      include: {
        defaultCategory: { include: { group: true } },
        _count: { select: { transactions: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.categoryGroup.findMany({
      where: { userId },
      include: { categories: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    }),
  ])

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Payees" />
        <main className="flex-1 p-3" role="main">
          <div className="mb-2">
            <p className="text-xs text-muted-foreground">
              Payees are created automatically during import. Set a default category to auto-assign it to future transactions.
            </p>
          </div>
          <PayeeManager
            initialPayees={payees as never}
            initialGroups={groups.map((g) => ({
              id: g.id,
              name: g.name,
              categories: g.categories.map((c) => ({ id: c.id, name: c.name })),
            }))}
          />
        </main>
      </div>
    </div>
  )
}
