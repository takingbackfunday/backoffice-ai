import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { CategoryManager } from '@/components/categories/category-manager'
import { prisma } from '@/lib/prisma'
import { seedDefaultCategories } from '@/lib/seed-categories'

export default async function CategoriesPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  let groups = await prisma.categoryGroup.findMany({
    where: { userId },
    include: {
      categories: {
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { transactions: true } } },
      },
    },
    orderBy: { sortOrder: 'asc' },
  })

  if (groups.length === 0) {
    await seedDefaultCategories(userId, prisma)
    groups = await prisma.categoryGroup.findMany({
      where: { userId },
      include: {
        categories: {
          orderBy: { sortOrder: 'asc' },
          include: { _count: { select: { transactions: true } } },
        },
      },
      orderBy: { sortOrder: 'asc' },
    })
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Categories" />
        <main className="flex-1 p-6" role="main">
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">
              Manage your category groups and categories. Click a name to rename it.
            </p>
          </div>
          <CategoryManager initialGroups={groups} />
        </main>
      </div>
    </div>
  )
}
