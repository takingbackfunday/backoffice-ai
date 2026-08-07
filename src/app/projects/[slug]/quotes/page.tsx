import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ProjectPageShell, getHubRoute } from '@/components/layout/project-page-shell'
import { QuoteList } from '@/components/projects/quote-list'

interface PageParams { params: Promise<{ slug: string }> }

export default async function ProjectQuotesPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug } = await params

  const project = await prisma.workspace.findFirst({
    where: { userId, slug, type: 'CLIENT' },
    include: {
      clientProfile: {
        include: {
          quotes: {
            orderBy: { createdAt: 'desc' },
            include: {
              job: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  })

  if (!project || !project.clientProfile) notFound()

  const quotes = project.clientProfile.quotes.map(q => ({
    id: q.id,
    quoteNumber: q.quoteNumber,
    title: q.title,
    status: q.status,
    version: q.version,
    currency: q.currency,
    totalQuoted: q.totalQuoted ? Number(q.totalQuoted) : null,
    isAmendment: q.isAmendment,
    createdAt: q.createdAt.toISOString(),
    job: q.job,
  }))

  const hub = getHubRoute(project.type)

  return (
    <ProjectPageShell
      project={project}
      slug={slug}
      breadcrumb={[hub, { label: project.name, href: `/projects/${slug}` }, { label: 'Quotes' }]}
      contentWidth="lg"
    >
      <div>
        <h2 className="text-lg font-semibold mb-6">Quotes</h2>
        <QuoteList projectId={project.id} projectSlug={slug} quotes={quotes} />
      </div>
    </ProjectPageShell>
  )
}
