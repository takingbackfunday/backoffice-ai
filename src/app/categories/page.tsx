import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { CategoryManager } from '@/components/categories/category-manager'

export default async function CategoriesPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

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
          <CategoryManager />
        </main>
      </div>
    </div>
  )
}
