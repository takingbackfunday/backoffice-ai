import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
import { QuoteList } from '@/components/projects/quote-list'
import { QuoteFromEstimate } from '@/components/projects/quote-from-estimate'
import { cn } from '@/lib/utils'

interface PageParams { params: Promise<{ slug: string }> }

function estimateCost(sections: { items: { hours: unknown; costRate: unknown; quantity: unknown }[] }[]): number {
  return sections.reduce((sum, s) =>
    sum + s.items.reduce((si, i) => {
      const hours = i.hours ? Number(i.hours) : 0
      const rate = i.costRate ? Number(i.costRate) : 0
      const qty = i.quantity ? Number(i.quantity) : 1
      if (hours > 0 && rate > 0) return si + hours * rate * qty
      if (rate > 0) return si + rate * qty
      return si
    }, 0),
  0)
}

const EST_STATUS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  FINAL: 'bg-green-100 text-green-700',
  SUPERSEDED: 'bg-amber-100 text-amber-700',
}

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
            include: { job: { select: { id: true, name: true } } },
          },
        },
      },
    },
  })
  if (!project || !project.clientProfile) notFound()

  const [estimates, jobs] = await Promise.all([
    prisma.estimate.findMany({
      where: { workspaceId: project.id },
      include: {
        sections: { include: { items: { select: { hours: true, costRate: true, quantity: true } } } },
        _count: { select: { quotes: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.job.findMany({
      where: { clientProfile: { workspaceId: project.id }, status: 'ACTIVE' },
      select: { id: true, name: true },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: project.clientProfile!.currency ?? 'USD', maximumFractionDigits: 0 }).format(n)

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
          <div className="max-w-4xl space-y-8">

            {/* Estimates — create quote from here */}
            {estimates.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Estimates</h2>
                <div className="space-y-2">
                  {estimates.map(est => (
                    <div key={est.id} className="flex items-center justify-between px-4 py-2.5 border rounded-lg">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{est.title}</span>
                          <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0', EST_STATUS[est.status] ?? 'bg-gray-100 text-gray-600')}>
                            {est.status.toLowerCase()}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {fmt(estimateCost(est.sections))}
                          {est._count.quotes > 0 ? ` · ${est._count.quotes} quote${est._count.quotes > 1 ? 's' : ''}` : ''}
                        </p>
                      </div>
                      <QuoteFromEstimate
                        projectId={project.id}
                        projectSlug={slug}
                        estimateId={est.id}
                        estimateStatus={est.status}
                        jobs={jobs}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quotes list */}
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Quotes</h2>
              <QuoteList projectSlug={slug} quotes={quotes} />
            </div>

          </div>
        </main>
      </div>
    </div>
  )
}
