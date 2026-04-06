import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
import { cn } from '@/lib/utils'

interface PageParams { params: Promise<{ slug: string }> }

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  FINAL: 'bg-green-100 text-green-700',
  SUPERSEDED: 'bg-amber-100 text-amber-700',
}

function estimateCost(sections: { items: { hours: number | null; costRate: number | null; quantity: number }[] }[]): number {
  return sections.reduce((sum, s) =>
    sum + s.items.reduce((si, i) => {
      const hours = i.hours ?? 0
      const rate = i.costRate ?? 0
      const qty = i.quantity ?? 1
      if (hours > 0 && rate > 0) return si + hours * rate * qty
      if (rate > 0) return si + rate * qty
      return si
    }, 0),
    0
  )
}

export default async function ProjectEstimatesPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug } = await params

  const project = await prisma.workspace.findFirst({
    where: { userId, slug, type: 'CLIENT' },
    include: {
      clientProfile: {
        include: {
          jobs: {
            include: {
              estimates: {
                include: {
                  sections: {
                    include: { items: { select: { hours: true, costRate: true, quantity: true } } },
                  },
                  _count: { select: { quotes: true } },
                },
                orderBy: { createdAt: 'desc' },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      },
    },
  })

  if (!project || !project.clientProfile) notFound()

  const jobs = project.clientProfile.jobs
  const allEstimates = jobs.flatMap(job =>
    job.estimates.map(est => ({ ...est, job: { id: job.id, name: job.name } }))
  ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const fmt = (n: number, currency: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

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

          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">{allEstimates.length} estimate{allEstimates.length !== 1 ? 's' : ''}</h2>
          </div>

          {allEstimates.length === 0 ? (
            <div className="text-center py-16 border border-dashed rounded-lg">
              <p className="text-sm text-muted-foreground mb-3">No estimates yet.</p>
              <p className="text-xs text-muted-foreground">Go to a job to create your first estimate.</p>
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Title</th>
                    <th className="text-left px-4 py-2 font-medium">Job</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                    <th className="text-right px-4 py-2 font-medium">Cost</th>
                    <th className="text-right px-4 py-2 font-medium">Quotes</th>
                    <th className="text-right px-4 py-2 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {allEstimates.map(est => {
                    const cost = estimateCost(est.sections.map(s => ({
                      items: s.items.map(i => ({
                        hours: i.hours ? Number(i.hours) : null,
                        costRate: i.costRate ? Number(i.costRate) : null,
                        quantity: Number(i.quantity),
                      }))
                    })))
                    return (
                      <tr key={est.id} className="hover:bg-muted/20">
                        <td className="px-4 py-2">
                          <Link
                            href={`/projects/${slug}/jobs/${est.job.id}/estimates/${est.id}`}
                            className="font-medium hover:underline"
                          >
                            {est.title}
                            {est.version > 1 && <span className="ml-1.5 text-xs text-muted-foreground">v{est.version}</span>}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          <Link href={`/projects/${slug}/jobs/${est.job.id}`} className="hover:underline">
                            {est.job.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2">
                          <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', STATUS_STYLES[est.status])}>
                            {est.status.toLowerCase()}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {cost > 0 ? fmt(cost, est.currency) : '—'}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground">
                          {est._count.quotes > 0 ? est._count.quotes : '—'}
                        </td>
                        <td className="px-4 py-2 text-right text-muted-foreground text-xs">
                          {new Date(est.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
