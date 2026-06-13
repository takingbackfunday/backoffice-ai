import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'
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
    >
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Quotes</h2>
          <Link
            href={`/projects/${slug}/quotes/new`}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus className="w-3 h-3" /> New Quote
          </Link>
        </div>
        <QuoteList projectSlug={slug} quotes={quotes} />
      </div>
    </ProjectPageShell>
  )
}
