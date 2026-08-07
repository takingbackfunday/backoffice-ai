import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ProjectPageShell, getHubRoute } from '@/components/layout/project-page-shell'
import { QuoteDetailClient } from '@/components/projects/quote-detail-client'
import { PipelineBreadcrumb } from '@/components/projects/pipeline-breadcrumb'
import { computeInvoiceTotals, toDisplay } from '@/lib/money'

interface PageParams { params: Promise<{ slug: string; quoteId: string }> }
interface SearchParams { downloaded?: string }

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n)
}

export default async function QuoteDetailPage({ params, searchParams }: PageParams & { searchParams: Promise<SearchParams> }) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug, quoteId } = await params
  const { downloaded } = await searchParams

  const project = await prisma.workspace.findFirst({
    where: { userId, slug, type: 'CLIENT' },
    include: { clientProfile: true },
  })
  if (!project || !project.clientProfile) notFound()

  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, clientProfileId: project.clientProfile.id },
    include: {
      sections: { include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
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
    const rootQuoteId = quote.rootQuoteId ?? quote.id
    const acceptedAmendments = await prisma.quote.findMany({
      where: { rootQuoteId, isAmendment: true, status: 'ACCEPTED' },
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

  const initialShowSentBanner = downloaded === '1' && quote.status === 'DRAFT'

  // Build pipeline breadcrumb nodes
  const pipelineNodes: import('@/components/projects/pipeline-breadcrumb').PipelineNode[] = []
  pipelineNodes.push({
    type: 'quote',
    id: quote.id,
    label: `Quote ${quote.quoteNumber}`,
    status: quote.status,
    href: `/projects/${slug}/quotes/${quote.id}`,
  })
  if (fulfillment) {
    const invCount = fulfillment.invoices.length
    const meta = `${invCount} invoice${invCount !== 1 ? 's' : ''} (${fmt(fulfillment.totalPaid, quote.currency)} / ${fmt(fulfillment.totalInvoiced, quote.currency)} invoiced)`
    pipelineNodes.push({
      type: 'invoices',
      id: 'invoices',
      label: 'Invoices',
      href: `/projects/${slug}/invoices`,
      meta,
    })
  }

  const hub = getHubRoute(project.type)

  return (
    <ProjectPageShell
      project={project}
      slug={slug}
      breadcrumb={[
        hub,
        { label: project.name, href: `/projects/${slug}` },
        { label: 'Quotes', href: `/projects/${slug}/quotes` },
        { label: quote.quoteNumber },
      ]}
      contentWidth="lg"
    >
      <div className="space-y-4">
        <div className="mb-1">
          <PipelineBreadcrumb nodes={pipelineNodes} projectSlug={slug} currentId={quote.id} />
        </div>
        <QuoteDetailClient
          projectId={project.id}
          projectSlug={slug}
          quote={quoteData}
          fulfillment={fulfillment}
          initialShowSentBanner={initialShowSentBanner}
        />
      </div>
    </ProjectPageShell>
  )
}
