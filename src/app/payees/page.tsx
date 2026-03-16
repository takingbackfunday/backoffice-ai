import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { PayeeManager } from '@/components/payees/payee-manager'

export default async function PayeesPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Payees" />
        <main className="flex-1 p-6" role="main">
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">
              Payees are created automatically during import. Set a default category to auto-assign it to future transactions.
            </p>
          </div>
          <PayeeManager />
        </main>
      </div>
    </div>
  )
}
