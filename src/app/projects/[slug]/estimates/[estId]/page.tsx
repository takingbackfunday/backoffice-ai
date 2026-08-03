import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ProjectPageShell, getHubRoute } from '@/components/layout/project-page-shell'
import { EstimateEditor } from '@/components/projects/estimate-editor'
import { PipelineBreadcrumb } from '@/components/projects/pipeline-breadcrumb'
import { cn } from '@/lib/utils'
import { toDisplay } from '@/lib/money'

interface PageParams { params: Promise<{ slug: string; estId: string }> }

export default async function EstimateDetailPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug, estId } = await params

  const project = await prisma.workspace.findFirst({
    where: { userId, slug, type: 'CLIENT' },
    include: { clientProfile: true },
  })
  if (!project || !project.clientProfile) notFound()

  const [estimate, jobs] = await Promise.all([
    prisma.estimate.findFirst({
      where: { id: estId, workspaceId: project.id },
      include: {
        sections: {
          include: { items: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
        quotes: {
          select: { id: true, quoteNumber: true, status: true, totalQuoted: true, currency: true },
        },
        parent: { select: { id: true, title: true, version: true, status: true } },
        revisions: { select: { id: true, title: true, version: true, status: true } },
      },
    }),
    prisma.job.findMany({
      where: { clientProfile: { workspaceId: project.id }, status: 'ACTIVE' },
      select: { id: true, name: true },
      orderBy: { createdAt: 'desc' },
    }),
  ])
  if (!estimate) notFound()

  const estimateData = JSON.parse(JSON.stringify({
    ...estimate,
    sections: estimate.sections.map(s => ({
      ...s,
      items: s.items.map(i => ({
        ...i,
        hours: i.hours ? toDisplay(i.hours) : null,
        costRate: i.costRate ? toDisplay(i.costRate) : null,
        quantity: toDisplay(i.quantity),
      })),
    })),
  }))

  // Build version chain
  const versionChain = [
    ...(estimate.parent ? [{ id: estimate.parent.id, title: estimate.parent.title, version: estimate.parent.version, status: estimate.parent.status }] : []),
    { id: estimate.id, title: estimate.title, version: estimate.version, status: estimate.status },
    ...estimate.revisions.map(r => ({ id: r.id, title: r.title, version: r.version, status: r.status })),
  ]

  // Build pipeline nodes
  const pipelineNodes: import('@/components/projects/pipeline-breadcrumb').PipelineNode[] = []
  const estLabel = estimate.version > 1 ? `Estimate ${estimate.title} (v${estimate.version})` : `Estimate ${estimate.title}`
  pipelineNodes.push({
    type: 'estimate',
    id: estimate.id,
    label: estLabel,
    status: estimate.status,
    href: `/projects/${slug}/estimates/${estimate.id}`,
  })
  const quoteCount = estimate.quotes.length
  if (quoteCount > 0) {
    const meta = estimate.quotes.map(q => `Quote ${q.quoteNumber} (${q.status.toLowerCase()})`).join(', ')
    pipelineNodes.push({
      type: 'invoices',
      id: 'quotes',
      label: `${quoteCount} quote${quoteCount !== 1 ? 's' : ''}`,
      href: `/projects/${slug}/quotes`,
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
        { label: 'Estimates', href: `/projects/${slug}/estimates` },
        { label: estimate.title },
      ]}
      contentWidth="lg"
    >
      <div className="space-y-4">
        <div className="mb-1">
          <PipelineBreadcrumb nodes={pipelineNodes} projectSlug={slug} currentId={estimate.id} />
        </div>
        {versionChain.length > 1 && (
          <div className="rounded-md border overflow-hidden">
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/30">
              Versions ({versionChain.length})
            </div>
            <div className="divide-y">
              {versionChain.map((v, i) => (
                <div
                  key={v.id}
                  className={cn(
                    'flex items-center justify-between px-3 py-2 text-xs',
                    v.id === estimate.id && 'bg-muted/20'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{i + 1}.</span>
                    {v.id === estimate.id ? (
                      <span className="font-medium">{v.title} v{v.version}</span>
                    ) : (
                      <a href={`/projects/${slug}/estimates/${v.id}`} className="font-medium hover:underline underline-offset-2">
                        {v.title} v{v.version} →
                      </a>
                    )}
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600">{v.status.toLowerCase()}</span>
                    {v.id === estimate.id && <span className="text-[10px] text-muted-foreground">(current)</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <EstimateEditor
          projectId={project.id}
          projectSlug={slug}
          clientName={project.clientProfile.contactName ?? project.name}
          billingType={project.clientProfile.billingType}
          existingEstimate={estimateData}
          jobs={jobs}
        />
      </div>
    </ProjectPageShell>
  )
}
