import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
import { QuoteDetailClient } from '@/components/projects/quote-detail-client'
import { computeInvoiceTotals, toDisplay } from '@/lib/money'

interface PageParams { params: Promise<{ slug: string; quoteId: string }> }

export default async function QuoteDetailPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug, quoteId } = await params

  const project = await prisma.workspace.findFirst({
    where: { userId, slug, type: 'CLIENT' },
    include: { clientProfile: true },
  })
  if (!project || !project.clientProfile) notFound()

  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, clientProfileId: project.clientProfile.id },
    include: {
      sections: { include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
      estimate: { select: { id: true, title: true, version: true } },
      job: { select: { id: true, name: true } },
      clientProfile: { select: { id: true, contactName: true, email: true, company: true } },
      previousVersion: { select: { id: true, quoteNumber: true, version: true } },
      nextVersion: { select: { id: true, quoteNumber: true, version: true } },
      amendments: {
        select: { id: true, quoteNumber: true, status: true, totalQuoted: true, signedAt: true },
      },
      _count: { select: { invoices: true } },
    },
  })
  if (!quote) notFound()

  // Load fulfillment for accepted quotes
  let fulfillment = null
  if (quote.status === 'ACCEPTED' || quote.status === 'AMENDED') {
    const acceptedAmendments = await prisma.quote.findMany({
      where: { parentQuoteId: quoteId, status: 'ACCEPTED' },
      include: { sections: { include: { items: true } } },
    })
    const invoices = await prisma.invoice.findMany({
      where: { quoteId, status: { not: 'VOID' } },
      include: {
        lineItems: true,
        payments: { where: { voidedAt: null } },
      },
    })

    const totalAgreed = quote.sections.reduce((sum, s) =>
      sum + s.items.reduce((si, i) => si + toDisplay(i.unitPrice) * toDisplay(i.quantity), 0), 0)
    const amendmentTotal = acceptedAmendments.reduce(
      (sum, a) => sum + a.sections.reduce((ss, s) => ss + s.items.reduce((si, i) => si + toDisplay(i.unitPrice) * toDisplay(i.quantity), 0), 0), 0
    )
    const effectiveTotal = totalAgreed + amendmentTotal
    const totalInvoiced = invoices.reduce(
      (sum, inv) => {
        const { total } = computeInvoiceTotals(inv)
        return sum + toDisplay(total)
      }, 0
    )
    const totalPaid = invoices.reduce((sum, inv) => {
      const { paid } = computeInvoiceTotals(inv)
      return sum + toDisplay(paid)
    }, 0)

    fulfillment = {
      totalAgreed,
      amendmentTotal,
      effectiveTotal,
      totalInvoiced,
      totalPaid,
      totalOutstanding: totalInvoiced - totalPaid,
      uninvoicedBalance: effectiveTotal - totalInvoiced,
      invoices: invoices.map(inv => {
        const { total, paid } = computeInvoiceTotals(inv)
        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          status: inv.status,
          total: toDisplay(total),
          paid: toDisplay(paid),
          issuedAt: inv.issueDate.toISOString(),
        }
      }),
    }
  }

  const quoteData = {
    ...JSON.parse(JSON.stringify(quote)),
    totalCost: quote.totalCost ? toDisplay(quote.totalCost) : null,
    totalQuoted: quote.totalQuoted ? toDisplay(quote.totalQuoted) : null,
    amendments: quote.amendments.map(a => ({
      ...a,
      totalQuoted: a.totalQuoted ? toDisplay(a.totalQuoted) : null,
    })),
  }

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
          <div className="max-w-4xl">
            <QuoteDetailClient
              projectId={project.id}
              projectSlug={slug}
              quote={quoteData}
              fulfillment={fulfillment}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
