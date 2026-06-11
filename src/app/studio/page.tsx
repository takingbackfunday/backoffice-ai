import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { parsePreferences } from '@/types/preferences'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { StudioClient } from '@/components/studio/studio-client'
import { computeInvoiceTotals, toDisplay } from '@/lib/money'
import { deriveInvoiceStatus } from '@/lib/invoice-status'

interface PageProps {
  searchParams: Promise<{ onboarding?: string }>
}

export default async function StudioPage({ searchParams }: PageProps) {
  const params = await searchParams
  const isOnboarding = params.onboarding === '1'
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
          quotes: {
            where: { status: { in: ['ACCEPTED', 'SENT'] } },
            select: { id: true, quoteNumber: true, title: true, totalQuoted: true, currency: true, status: true, sentAt: true, job: { select: { name: true } }, _count: { select: { invoices: true } } },
            orderBy: { createdAt: 'desc' },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const overheadWorkspace = await prisma.workspace.findFirst({
    where: { userId, isDefault: true },
    select: { id: true },
  })

  const projectIds = projects.map(p => p.id)
  const receiptCounts = await prisma.receipt.groupBy({
    by: ['workspaceId'],
    where: { userId, workspaceId: { in: projectIds } },
    _count: { id: true },
  })
  const receiptCountMap = Object.fromEntries(
    receiptCounts.map(r => [r.workspaceId, r._count.id])
  )

  const [prefs, pendingSuggestions, recentPaymentsCount, txCount] = await Promise.all([
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
    prisma.transaction.count({ where: { account: { userId } } }),
  ])
  const prefsData = parsePreferences(prefs?.data)
  const paymentMethods = prefsData.paymentMethods ?? {}
  const invoiceDefaults = prefsData.invoiceDefaults

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  // Build serialized client cards
  const clients = projects
    .filter(p => p.clientProfile)
    .map(p => {
      const profile = p.clientProfile!
      const invoices = profile.invoices

      // Compute totals per invoice and derive status at read time
      const invoicesWithTotals = invoices.map(inv => {
        const { total, paid } = computeInvoiceTotals(inv)
        const derivedStatus = deriveInvoiceStatus(inv, now)
        return { inv, total: toDisplay(total), paid: toDisplay(paid), derivedStatus }
      })

      const outstanding = invoicesWithTotals
        .filter(({ derivedStatus }) => derivedStatus === 'SENT' || derivedStatus === 'PARTIAL')
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
        acceptedQuotes: profile.quotes
          .filter(q => q.status === 'ACCEPTED')
          .map(q => ({
            id: q.id,
            quoteNumber: q.quoteNumber,
            title: q.title,
            totalQuoted: q.totalQuoted ? toDisplay(q.totalQuoted) : null,
            currency: q.currency,
            hasInvoice: q._count.invoices > 0,
            jobName: q.job?.name ?? null,
          })),
        sentQuotes: profile.quotes
          .filter(q => q.status === 'SENT')
          .map(q => ({
            id: q.id,
            quoteNumber: q.quoteNumber,
            title: q.title,
            totalQuoted: q.totalQuoted ? toDisplay(q.totalQuoted) : null,
            currency: q.currency,
            sentAt: q.sentAt ? q.sentAt.toISOString() : null,
            jobName: q.job?.name ?? null,
          })),
        invoices: invoicesWithTotals.map(({ inv, total, paid, derivedStatus }) => ({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          status: derivedStatus,
          issueDate: inv.issueDate.toISOString(),
          dueDate: inv.dueDate.toISOString(),
          currency: inv.currency,
          total,
          paid,
          jobName: inv.job?.name ?? null,
        })),
        receiptCount: receiptCountMap[p.id] ?? 0,
      }
    })

  // KPIs
  const allInvoices = projects
    .flatMap(p => p.clientProfile?.invoices ?? [])
    .map(inv => {
      const { total, paid } = computeInvoiceTotals(inv)
      const derivedStatus = deriveInvoiceStatus(inv, now)
      return { inv, total: toDisplay(total), paid: toDisplay(paid), derivedStatus }
    })

  const activeClients = clients.length
  const openInvoices = allInvoices.filter(({ derivedStatus }) =>
    ['DRAFT', 'SENT', 'PARTIAL'].includes(derivedStatus)
  ).length

  const totalOutstanding = allInvoices
    .filter(({ derivedStatus }) => derivedStatus === 'SENT' || derivedStatus === 'PARTIAL')
    .reduce((s, { total, paid }) => s + (total - paid), 0)

  const revenueThisMonth = allInvoices
    .flatMap(({ inv }) => inv.payments)
    .filter(p => new Date(p.paidDate) >= startOfMonth)
    .reduce((s, p) => s + toDisplay(p.amount), 0)

  const overdueCount = allInvoices.filter(({ derivedStatus }) =>
    derivedStatus === 'OVERDUE'
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
          <StudioClient clients={clients} kpis={kpis} paymentMethods={paymentMethods} pendingSuggestions={pendingSuggestions} recentPaymentsCount={recentPaymentsCount} invoiceDefaults={invoiceDefaults} isOnboarding={isOnboarding} hasOverheadWorkspace={!!overheadWorkspace} hasTransactions={txCount > 0} />
        </main>
      </div>
    </div>
  )
}
