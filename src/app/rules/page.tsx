import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { RulesManager } from '@/components/rules/rules-manager'

export const metadata = { title: 'Rules — Backoffice AI' }

export default async function RulesPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Rules" />
        <main className="flex-1 p-6 max-w-4xl" role="main">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Auto-categorization Rules</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Rules run on every CSV import and pre-fill the category field. Your rules run first; system rules are the fallback.
            </p>
          </div>
          <RulesManager />
        </main>
      </div>
    </div>
  )
}
