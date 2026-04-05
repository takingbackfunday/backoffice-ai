import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
import { Decimal } from 'decimal.js'

interface PageParams { params: Promise<{ slug: string }> }

export default async function ProjectFinancialsPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug } = await params

  const project = await prisma.workspace.findFirst({
    where: { userId, slug },
  })

  if (!project) notFound()

  const transactions = await prisma.transaction.findMany({
    where: { workspaceId: project.id },
    include: { categoryRef: true, payee: true },
    orderBy: { date: 'desc' },
  })

  const totalIncome = transactions
    .filter(t => new Decimal(t.amount.toString()).greaterThan(0))
    .reduce((sum, t) => sum.plus(t.amount.toString()), new Decimal(0))

  const totalExpenses = transactions
    .filter(t => new Decimal(t.amount.toString()).lessThan(0))
    .reduce((sum, t) => sum.plus(t.amount.toString()), new Decimal(0))

  const net = totalIncome.plus(totalExpenses)

  const fmt = (d: Decimal) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(d.toNumber())

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title={project.name} />
        <main className="flex-1 p-6" role="main">
          <ProjectDetailHeader
            id={project.id}
            name={project.name}
            type={project.type}
            isActive={project.isActive}
            description={project.description}
          />
          <ProjectSubNav slug={slug} type={project.type} />

          {/* KPI row */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground mb-1">Income</p>
              <p className="text-xl font-semibold text-green-700">{fmt(totalIncome)}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground mb-1">Expenses</p>
              <p className="text-xl font-semibold text-red-700">{fmt(totalExpenses.abs())}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground mb-1">Net</p>
              <p className={`text-xl font-semibold ${net.greaterThanOrEqualTo(0) ? 'text-green-700' : 'text-red-700'}`}>
                {fmt(net)}
              </p>
            </div>
          </div>

          {/* Transactions table */}
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Date</th>
                  <th className="text-left px-4 py-2 font-medium">Description</th>
                  <th className="text-left px-4 py-2 font-medium">Category</th>
                  <th className="text-right px-4 py-2 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      No transactions linked to this project.
                    </td>
                  </tr>
                ) : (
                  transactions.map(t => (
                    <tr key={t.id} className="hover:bg-muted/20">
                      <td className="px-4 py-2 text-muted-foreground">
                        {new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-2">{t.description}</td>
                      <td className="px-4 py-2 text-muted-foreground">{t.categoryRef?.name ?? t.category ?? '—'}</td>
                      <td className={`px-4 py-2 text-right font-medium ${new Decimal(t.amount.toString()).greaterThan(0) ? 'text-green-700' : 'text-red-700'}`}>
                        {fmt(new Decimal(t.amount.toString()))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  )
}
