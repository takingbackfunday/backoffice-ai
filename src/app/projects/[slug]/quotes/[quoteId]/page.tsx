import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
import { QuoteDetailClient } from '@/components/projects/quote-detail-client'

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

    const sumItems = (items: { unitPrice: unknown; quantity: unknown }[]) =>
      items.reduce((s, i) => s + Number(i.unitPrice) * Number(i.quantity), 0)

    const totalAgreed = quote.sections.reduce((sum, s) => sum + sumItems(s.items), 0)
    const amendmentTotal = acceptedAmendments.reduce(
      (sum, a) => sum + a.sections.reduce((ss, s) => ss + sumItems(s.items), 0), 0
    )
    const effectiveTotal = totalAgreed + amendmentTotal
    const totalInvoiced = invoices.reduce(
      (sum, inv) => sum + inv.lineItems.filter(li => !li.isTaxLine)
        .reduce((si, li) => si + Number(li.unitPrice) * Number(li.quantity), 0), 0
    )
    const totalPaid = invoices.flatMap(inv => inv.payments)
      .reduce((sum, p) => sum + Number(p.amount), 0)

    fulfillment = {
      totalAgreed,
      amendmentTotal,
      effectiveTotal,
      totalInvoiced,
      totalPaid,
      totalOutstanding: totalInvoiced - totalPaid,
      uninvoicedBalance: effectiveTotal - totalInvoiced,
      invoices: invoices.map(inv => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        total: inv.lineItems.filter(li => !li.isTaxLine)
          .reduce((s, li) => s + Number(li.unitPrice) * Number(li.quantity), 0),
        paid: inv.payments.reduce((s, p) => s + Number(p.amount), 0),
        issuedAt: inv.issueDate.toISOString(),
      })),
    }
  }

  const quoteData = {
    ...JSON.parse(JSON.stringify(quote)),
    totalCost: quote.totalCost ? Number(quote.totalCost) : null,
    totalQuoted: quote.totalQuoted ? Number(quote.totalQuoted) : null,
    amendments: quote.amendments.map(a => ({
      ...a,
      totalQuoted: a.totalQuoted ? Number(a.totalQuoted) : null,
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
