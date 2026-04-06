import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
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
        </main>
      </div>
    </div>
  )
}
