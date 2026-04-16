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

  const [transactions, receipts] = await Promise.all([
    prisma.transaction.findMany({
      where: { workspaceId: project.id },
      include: { categoryRef: true, payee: true },
      orderBy: { date: 'desc' },
    }),
    prisma.receipt.findMany({
      where: { workspaceId: project.id, userId },
      orderBy: { createdAt: 'desc' },
    }),
  ])

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

          {/* Receipts section */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Receipts</h2>
              <a
                href={`/receipts?workspaceId=${project.id}`}
                className="text-xs text-muted-foreground hover:underline"
              >
                View all →
              </a>
            </div>
            {receipts.length === 0 ? (
              <div className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">
                No receipts linked to this project.{' '}
                <a href={`/receipts?upload=1&workspaceId=${project.id}`} className="underline">
                  Add one
                </a>
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium w-16">Photo</th>
                      <th className="text-left px-4 py-2 font-medium">Vendor</th>
                      <th className="text-left px-4 py-2 font-medium">Date</th>
                      <th className="text-right px-4 py-2 font-medium">Total</th>
                      <th className="text-left px-4 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {receipts.map(r => {
                      const data = r.extractedData as Record<string, unknown> | null
                      const vendor = data?.vendor ? String(data.vendor) : null
                      const total = data?.total != null ? Number(data.total) : null
                      const dateStr = data?.date ? String(data.date) : null
                      const STATUS_LABELS: Record<string, string> = {
                        PROCESSING: 'Processing',
                        NEEDS_REVIEW: 'Needs review',
                        READY: 'Ready',
                        INVOICED: 'Invoiced',
                        FAILED: 'Failed',
                      }
                      const STATUS_COLORS: Record<string, string> = {
                        PROCESSING: 'text-amber-700',
                        NEEDS_REVIEW: 'text-amber-700',
                        READY: 'text-green-700',
                        INVOICED: 'text-blue-700',
                        FAILED: 'text-red-700',
                      }
                      return (
                        <tr key={r.id} className="hover:bg-muted/20">
                          <td className="px-4 py-2">
                            {r.thumbnailUrl ? (
                              <img
                                src={r.thumbnailUrl}
                                alt="Receipt"
                                width={40}
                                height={40}
                                className="rounded object-cover"
                                style={{ width: 40, height: 40 }}
                              />
                            ) : (
                              <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-muted-foreground text-xs">
                                —
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2">{vendor ?? <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {dateStr
                              ? new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                              : '—'}
                          </td>
                          <td className="px-4 py-2 text-right font-medium">
                            {total != null
                              ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total)
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className={`px-4 py-2 text-xs font-medium ${STATUS_COLORS[r.status] ?? 'text-muted-foreground'}`}>
                            {STATUS_LABELS[r.status] ?? r.status}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
