import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { StudioClient } from '@/components/studio/studio-client'
import { fetchStudioKpis, fetchClientCardSummaries, fetchLightweightInvoices, fetchLightweightQuotes } from '@/lib/studio-kpis'

interface PageProps {
  searchParams: Promise<{ onboarding?: string }>
}

export default async function StudioPage({ searchParams }: PageProps) {
  const params = await searchParams
  const isOnboarding = params.onboarding === '1'
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // Parallel fetch: KPIs, card summaries, lightweight invoices, and quotes via SQL
  // Plus auxiliary data (preferences, suggestions, etc.)
  const [kpis, cardSummaries, flatInvoices, flatQuotes, overheadWorkspace, pendingSuggestions, recentPaymentsCount] = await Promise.all([
    fetchStudioKpis(userId),
    fetchClientCardSummaries(userId),
    fetchLightweightInvoices(userId),
    fetchLightweightQuotes(userId),
    prisma.workspace.findFirst({ where: { userId, isDefault: true }, select: { id: true } }),
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

  // Build client cards from SQL summaries
  const clients = cardSummaries.map(cs => ({
    id: cs.workspaceId,
    name: cs.workspaceName,
    slug: cs.workspaceSlug,
    company: cs.company,
    outstanding: cs.outstanding,
    currency: cs.currency,
    clientProfileId: cs.clientProfileId,
    contactName: cs.contactName,
    email: cs.email,
    paymentTermDays: cs.paymentTermDays,
    billingType: cs.billingType,
    jobs: [] as { id: string; name: string }[],
    acceptedQuotes: [] as { id: string; quoteNumber: string; title: string; totalQuoted: number | null; currency: string; hasInvoice: boolean; jobName: string | null }[],
    sentQuotes: [] as { id: string; quoteNumber: string; title: string; totalQuoted: number | null; currency: string; sentAt: string | null; jobName: string | null }[],
    invoices: [] as { id: string; invoiceNumber: string; status: string; issueDate: string; dueDate: string; currency: string; total: number; paid: number; jobName: string | null }[],
    receiptCount: 0,
  }))

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
          <StudioClient
            clients={clients}
            flatInvoices={flatInvoices}
            flatQuotes={flatQuotes}
            kpis={kpis}
            pendingSuggestions={pendingSuggestions}
            recentPaymentsCount={recentPaymentsCount}
            isOnboarding={isOnboarding}
            hasOverheadWorkspace={!!overheadWorkspace}
          />
        </main>
      </div>
    </div>
  )
}
