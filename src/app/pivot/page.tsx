import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { PivotPageClient } from '@/components/pivot/pivot-page-client'

export default async function PivotPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <Header title="Pivot Table" />
        <main className="flex-1 p-6" role="main">
          <PivotPageClient />
        </main>
      </div>
    </div>
  )
}
