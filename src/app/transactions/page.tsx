import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { TransactionTable } from '@/components/transactions/transaction-table'

export default async function TransactionsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Transactions" />
        <main className="flex-1 p-6" role="main">
          <TransactionTable userId={userId} />
        </main>
      </div>
    </div>
  )
}
