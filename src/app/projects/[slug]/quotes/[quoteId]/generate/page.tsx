import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ProjectPageShell, getHubRoute } from '@/components/layout/project-page-shell'
import { QuoteGenerator } from '@/components/projects/quote-generator'
import { toDisplay } from '@/lib/money'

interface PageParams { params: Promise<{ slug: string; quoteId: string }> }

export default async function QuoteGeneratorPage({ params }: PageParams) {
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
      estimate: {
        include: {
          sections: { include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
        },
      },
    },
  })
  if (!quote) notFound()
  if (!quote.estimate) notFound()
  if (quote.status !== 'DRAFT') redirect(`/projects/${slug}/quotes/${quoteId}`)

  // Shell estimate: auto-created as DRAFT when the quote was made without an existing estimate.
  // The generate page renders an inline editor so the user can fill in scope first.
  const estimateIsShell = quote.estimate.status === 'DRAFT'

  const quoteData = JSON.parse(JSON.stringify({
    ...quote,
    totalCost: quote.totalCost ? toDisplay(quote.totalCost) : null,
    totalQuoted: quote.totalQuoted ? toDisplay(quote.totalQuoted) : null,
    sections: quote.sections.map(s => ({
      ...s,
      items: s.items.map(i => ({
        ...i,
        unitPrice: toDisplay(i.unitPrice),
        quantity: toDisplay(i.quantity),
        costBasis: i.costBasis ? toDisplay(i.costBasis) : null,
        marginPercent: i.marginPercent ? toDisplay(i.marginPercent) : null,
      })),
    })),
  }))

  const estimateData = JSON.parse(JSON.stringify({
    ...quote.estimate,
    sections: quote.estimate.sections.map(s => ({
      ...s,
      items: s.items.map(i => ({
        ...i,
        hours: i.hours ? toDisplay(i.hours) : null,
        costRate: i.costRate ? toDisplay(i.costRate) : null,
        quantity: toDisplay(i.quantity),
      })),
    })),
  }))

  const hub = getHubRoute(project.type)

  return (
    <ProjectPageShell
      project={project}
      slug={slug}
      breadcrumb={[
        hub,
        { label: project.name, href: `/projects/${slug}` },
        { label: 'Quotes', href: `/projects/${slug}/quotes` },
        { label: quote.quoteNumber, href: `/projects/${slug}/quotes/${quoteId}` },
        { label: 'Generate' },
      ]}
    >
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Review Quote {quote.quoteNumber}</h2>
        <p className="text-sm text-muted-foreground">Adjust margins and scope before sending to client.</p>
      </div>
      <div className="h-[calc(100vh-280px)]">
        <QuoteGenerator
          projectId={project.id}
          projectSlug={slug}
          quote={quoteData}
          estimate={estimateData}
          estimateIsShell={estimateIsShell}
        />
      </div>
    </ProjectPageShell>
  )
}
