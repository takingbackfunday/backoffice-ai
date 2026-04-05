import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { StudioClient } from '@/components/studio/studio-client'

export default async function StudioPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const projects = await prisma.workspace.findMany({
    where: { userId, type: 'CLIENT', isActive: true },
    include: {
      clientProfile: {
        include: {
          invoices: {
            include: {
              job: { select: { id: true, name: true } },
              lineItems: true,
              payments: true,
            },
            orderBy: { createdAt: 'desc' },
          },
          jobs: { where: { status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { createdAt: 'desc' } },
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [prefs, pendingSuggestions, recentPaymentsCount] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId } }),
    prisma.invoicePaymentSuggestion.count({ where: { userId, status: 'PENDING' } }),
    prisma.invoicePayment.count({
      where: {
        paidDate: { gte: sevenDaysAgo },
        invoice: {
          OR: [
            { clientProfile: { workspace: { userId } } },
            { lease: { unit: { propertyProfile: { workspace: { userId } } } } },
          ],
        },
      },
    }),
  ])
  const prefsData = (prefs?.data ?? {}) as Record<string, unknown>
  const paymentMethods = (prefsData.paymentMethods ?? {}) as import('@/lib/pdf/invoice-pdf').PaymentMethods
  const invoiceDefaults = prefsData.invoiceDefaults as {
    taxEnabled?: boolean; taxLabel?: string; taxMode?: 'percent' | 'flat'; taxRate?: string; currency?: string; notes?: string
  } | undefined

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  // Build serialized client cards
  const clients = projects
    .filter(p => p.clientProfile)
    .map(p => {
      const profile = p.clientProfile!
      const invoices = profile.invoices

      // Compute totals per invoice
      const invoicesWithTotals = invoices.map(inv => {
        const total = inv.lineItems.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0)
        const paid = inv.payments.reduce((s, pay) => s + Number(pay.amount), 0)
        return { inv, total, paid }
      })

      const outstanding = invoicesWithTotals
        .filter(({ inv }) => inv.status !== 'VOID' && inv.status !== 'PAID')
        .reduce((s, { total, paid }) => s + (total - paid), 0)

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        company: profile.company ?? null,
        outstanding,
        currency: profile.currency,
        clientProfileId: profile.id,
        contactName: profile.contactName ?? null,
        email: profile.email ?? null,
        paymentTermDays: profile.paymentTermDays ?? 30,
        billingType: profile.billingType ?? 'HOURLY',
        jobs: profile.jobs,
        invoices: invoicesWithTotals.map(({ inv, total, paid }) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          status: inv.status,
          issueDate: inv.issueDate.toISOString(),
          dueDate: inv.dueDate.toISOString(),
          currency: inv.currency,
          total,
          paid,
          jobName: inv.job?.name ?? null,
        })),
      }
    })

  // KPIs
  const allInvoices = projects
    .flatMap(p => p.clientProfile?.invoices ?? [])
    .map(inv => {
      const total = inv.lineItems.reduce((s, i) => s + Number(i.quantity) * Number(i.unitPrice), 0)
      const paid = inv.payments.reduce((s, pay) => s + Number(pay.amount), 0)
      return { inv, total, paid }
    })

  const activeClients = clients.length
  const openInvoices = allInvoices.filter(({ inv }) =>
    ['DRAFT', 'SENT', 'PARTIAL'].includes(inv.status)
  ).length

  const totalOutstanding = allInvoices
    .filter(({ inv }) => inv.status !== 'VOID' && inv.status !== 'PAID')
    .reduce((s, { total, paid }) => s + (total - paid), 0)

  const revenueThisMonth = allInvoices
    .flatMap(({ inv }) => inv.payments)
    .filter(p => new Date(p.paidDate) >= startOfMonth)
    .reduce((s, p) => s + Number(p.amount), 0)

  const overdueCount = allInvoices.filter(({ inv }) =>
    inv.status !== 'PAID' && inv.status !== 'VOID' && new Date(inv.dueDate) < now
  ).length

  const kpis = { activeClients, openInvoices, totalOutstanding, revenueThisMonth, overdueCount }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title="Client Hub" />
        <main className="flex-1 p-6" role="main">
          <div className="mb-6">
            <h1 className="text-xl font-bold">Client Hub</h1>
            <p className="text-sm text-muted-foreground">Overview of your client projects and invoices</p>
          </div>
          <StudioClient clients={clients} kpis={kpis} paymentMethods={paymentMethods} pendingSuggestions={pendingSuggestions} recentPaymentsCount={recentPaymentsCount} invoiceDefaults={invoiceDefaults} />
        </main>
      </div>
    </div>
  )
}
