import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
import { QuoteGenerator } from '@/components/projects/quote-generator'

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
  if (!quote || !quote.estimate) notFound()
  if (quote.status !== 'DRAFT') redirect(`/projects/${slug}/quotes/${quoteId}`)

  const quoteData = JSON.parse(JSON.stringify({
    ...quote,
    totalCost: quote.totalCost ? Number(quote.totalCost) : null,
    totalQuoted: quote.totalQuoted ? Number(quote.totalQuoted) : null,
    sections: quote.sections.map(s => ({
      ...s,
      items: s.items.map(i => ({
        ...i,
        unitPrice: Number(i.unitPrice),
        quantity: Number(i.quantity),
        costBasis: i.costBasis ? Number(i.costBasis) : null,
        marginPercent: i.marginPercent ? Number(i.marginPercent) : null,
      })),
    })),
  }))

  const estimateData = JSON.parse(JSON.stringify({
    ...quote.estimate,
    sections: quote.estimate.sections.map(s => ({
      ...s,
      items: s.items.map(i => ({
        ...i,
        hours: i.hours ? Number(i.hours) : null,
        costRate: i.costRate ? Number(i.costRate) : null,
        quantity: Number(i.quantity),
      })),
    })),
  }))

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
            />
          </div>
        </main>
      </div>
    </div>
  )
}
