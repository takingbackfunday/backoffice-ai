import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { toDisplay } from '@/lib/money'
import { ProjectPageShell, getHubRoute } from '@/components/layout/project-page-shell'
import { AmendmentEditor } from '@/components/projects/amendment-editor'

interface PageParams { params: Promise<{ slug: string; quoteId: string }> }

export default async function QuoteAmendPage({ params }: PageParams) {
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
    },
  })
  if (!quote) notFound()

  // ACCEPTED/INVOICED-only guard — only accepted quotes can be amended
  if (quote.status !== 'ACCEPTED' && quote.status !== 'INVOICED') {
    redirect(`/projects/${slug}/quotes/${quoteId}`)
  }

  const hub = getHubRoute(project.type)

  // Calculate original total
  const originalTotal = quote.sections.reduce(
    (sum, s) => sum + s.items.reduce((si, i) => si + toDisplay(i.unitPrice) * toDisplay(i.quantity), 0),
    0,
  )

  return (
    <ProjectPageShell
      project={project}
      slug={slug}
      breadcrumb={[
        hub,
        { label: project.name, href: `/projects/${slug}` },
        { label: 'Quotes', href: `/projects/${slug}/quotes` },
        { label: quote.quoteNumber, href: `/projects/${slug}/quotes/${quote.id}` },
        { label: 'Add Change Order' },
      ]}
    >
      <div className="max-w-3xl">
        <h2 className="text-lg font-semibold mb-4">Add Change Order</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Create an amendment to the accepted quote <strong>{quote.quoteNumber}</strong>.
          Only the changed line items need to be listed below.
        </p>
        <AmendmentEditor
          projectId={project.id}
          projectSlug={slug}
          quoteId={quote.id}
          currency={quote.currency}
          originalTotal={originalTotal}
        />
      </div>
    </ProjectPageShell>
  )
}
