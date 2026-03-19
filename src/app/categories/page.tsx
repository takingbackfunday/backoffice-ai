import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { CategoryManager } from '@/components/categories/category-manager'
import { BusinessTypePicker } from '@/components/categories/business-type-picker'
import { prisma } from '@/lib/prisma'
import { getCategoryCounts } from '@/lib/seed-categories'
import { ResetCategoriesButton } from '@/components/categories/reset-categories-button'

export default async function CategoriesPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const [groups, prefs] = await Promise.all([
    prisma.categoryGroup.findMany({
      where: { userId },
      include: {
        categories: {
          orderBy: { sortOrder: 'asc' },
          include: { _count: { select: { transactions: true } } },
        },
      },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.userPreference.findUnique({ where: { userId } }),
  ])

  const data = (prefs?.data ?? {}) as Record<string, unknown>
  const hasBusinessType = typeof data.businessType === 'string'
  const needsOnboarding = groups.length === 0 && !hasBusinessType

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Categories" />
        <main className="flex-1 p-6" role="main">
          {needsOnboarding ? (
            <BusinessTypePicker counts={getCategoryCounts()} />
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Manage your category groups and categories. Click a name to rename it.
                  {hasBusinessType && (
                    <span className="ml-2 text-xs text-muted-foreground/70">
                      ({data.businessType === 'freelance'
                        ? 'Schedule C'
                        : data.businessType === 'property'
                          ? 'Schedule E'
                          : data.businessType === 'personal'
                            ? 'Personal finance'
                            : 'Schedules C + E'})
                    </span>
                  )}
                </p>
                <ResetCategoriesButton />
              </div>
              <CategoryManager initialGroups={groups} />
            </>
          )}
        </main>
      </div>
    </div>
  )
}
