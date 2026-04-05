import { Suspense } from 'react'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { RulesManager } from '@/components/rules/rules-manager'
import { prisma } from '@/lib/prisma'
import { seedDefaultCategories } from '@/lib/seed-categories'

export const metadata = { title: 'Rules — Backoffice AI' }

export default async function RulesPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  // Fetch all data server-side in parallel — no client-side waterfall
  const [rules, projects, payees, categoryGroupsRaw, accounts, pendingSuggestions] = await Promise.all([
    prisma.categorizationRule.findMany({
      where: { userId },
      include: {
        workspace: { select: { id: true, name: true } },
        categoryRef: { include: { group: true } },
        payee: true,
      },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.workspace.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.payee.findMany({
      where: { userId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.categoryGroup.findMany({
      where: { userId },
      include: { categories: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.account.findMany({
      where: { userId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.ruleSuggestion.findMany({
      where: { userId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  // Seed categories if first visit
  let categoryGroups = categoryGroupsRaw
  if (categoryGroups.length === 0) {
    await seedDefaultCategories(userId, prisma)
    categoryGroups = await prisma.categoryGroup.findMany({
      where: { userId },
      include: { categories: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    })
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Rules" />
        <main className="flex-1 p-6 max-w-4xl" role="main">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Rules</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Rules automatically categorize transactions on import. Define conditions and the category, payee, or project to apply when they match.
            </p>
          </div>
          <Suspense>
            <RulesManager
              initialRules={rules as never}
              initialWorkspaces={projects}
              initialPayees={payees}
              initialAccounts={accounts}
              initialPendingSuggestions={pendingSuggestions as never}
              initialCategoryGroups={categoryGroups.map((g) => ({
                id: g.id,
                name: g.name,
                categories: g.categories.map((c) => ({ id: c.id, name: c.name })),
              }))}
            />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
