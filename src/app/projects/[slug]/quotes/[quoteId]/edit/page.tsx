import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { toDisplay } from '@/lib/money'
import { ProjectPageShell, getHubRoute } from '@/components/layout/project-page-shell'
import { QuoteEditClient } from './quote-edit-client'

interface PageParams { params: Promise<{ slug: string; quoteId: string }> }

export default async function QuoteEditPage({ params }: PageParams) {
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
      sections: {
        include: { items: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      },
      job: { select: { id: true, name: true } },
      clientProfile: { select: { id: true, contactName: true, company: true } },
    },
  })
  if (!quote) notFound()

  // DRAFT-only guard — non-DRAFT quotes redirect to the detail page
  if (quote.status !== 'DRAFT') {
    redirect(`/projects/${slug}/quotes/${quoteId}`)
  }

  // Load margin rules
  const marginRules = await prisma.marginRule.findMany({
    where: { userId },
    orderBy: { tag: 'asc' },
  })

  // Serialize Decimals for the client component
  const initialData = {
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    title: quote.title,
    currency: quote.currency,
    notes: quote.notes,
    terms: quote.terms,
    validUntil: quote.validUntil?.toISOString() ?? null,
    status: quote.status,
    sections: quote.sections.map(s => ({
      id: s.id,
      name: s.name,
      items: s.items.map(i => ({
        id: i.id,
        description: i.description,
        quantity: toDisplay(i.quantity),
        unit: i.unit,
        unitPrice: toDisplay(i.unitPrice),
        costRate: i.costRate ? toDisplay(i.costRate) : null,
        tags: i.tags,
        internalNotes: i.internalNotes,
        riskLevel: i.riskLevel,
        priceManual: i.priceManual,
        isOptional: i.isOptional,
      })),
    })),
  }

  const hub = getHubRoute(project.type)

  return (
    <ProjectPageShell
      contentWidth="md"
      project={project}
      slug={slug}
      breadcrumb={[
        hub,
        { label: project.name, href: `/projects/${slug}` },
        { label: 'Quotes', href: `/projects/${slug}/quotes` },
        { label: quote.quoteNumber, href: `/projects/${slug}/quotes/${quote.id}` },
        { label: 'Edit' },
      ]}
    >
      <QuoteEditClient
        initialData={initialData}
        marginRules={marginRules.map(r => ({ ...r, marginPct: Number(r.marginPct) }))}
        projectId={project.id}
        projectSlug={slug}
        clientName={quote.clientProfile.contactName ?? undefined}
        jobName={quote.job?.name}
      />
    </ProjectPageShell>
  )
}
