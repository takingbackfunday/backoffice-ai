import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

export default async function AccountsPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const accounts = await prisma.account.findMany({
    where: { userId },
    include: { institution: true },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Accounts" />
        <main className="flex-1 p-6" role="main">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">Your bank accounts &amp; cards</h2>
            <a
              href="/accounts/new"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              data-testid="add-account-btn"
              aria-label="Add a new account"
            >
              Add account
            </a>
          </div>

          {accounts.length === 0 ? (
            <p className="text-muted-foreground">
              No accounts yet. Add an account to start importing transactions.
            </p>
          ) : (
            <ul className="space-y-3" data-testid="accounts-list">
              {accounts.map((account) => (
                <li key={account.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium">{account.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {account.institution.name} · {account.type.replace('_', ' ')} · {account.currency}
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {account.lastImportAt
                      ? `Last import: ${new Date(account.lastImportAt).toLocaleDateString()}`
                      : 'Never imported'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
    </div>
  )
}
