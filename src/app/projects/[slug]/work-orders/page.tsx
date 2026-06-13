import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ProjectPageShell, getHubRoute } from '@/components/layout/project-page-shell'
import { WorkOrderList } from '@/components/projects/work-order-list'
import { toDisplay } from '@/lib/money'

interface PageParams { params: Promise<{ slug: string }> }

export default async function ProjectWorkOrdersPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug } = await params

  const project = await prisma.workspace.findFirst({
    where: { userId, slug },
  })

  if (!project) notFound()
  if (project.type !== 'CLIENT') redirect(`/projects/${slug}`)

  const workOrders = await prisma.workOrder.findMany({
    where: { workspaceId: project.id },
    include: {
      vendor: { select: { id: true, name: true } },
      job: { select: { id: true, name: true } },
      bills: { select: { id: true, amount: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const serialized = workOrders.map(wo => ({
    id: wo.id,
    title: wo.title,
    description: wo.description ?? null,
    status: wo.status,
    agreedCost: wo.agreedCost ? toDisplay(wo.agreedCost) : null,
    scheduledDate: wo.scheduledDate?.toISOString() ?? null,
    createdAt: wo.createdAt.toISOString(),
    vendor: wo.vendor ? { id: wo.vendor.id, name: wo.vendor.name } : null,
    job: wo.job ? { id: wo.job.id, name: wo.job.name } : null,
    bills: wo.bills.map(b => ({
      id: b.id,
      amount: toDisplay(b.amount),
      status: b.status,
    })),
  }))

  const hub = getHubRoute(project.type)

  return (
    <ProjectPageShell
      project={project}
      slug={slug}
      breadcrumb={[hub, { label: project.name, href: `/projects/${slug}` }, { label: 'Work Orders' }]}
    >
      <WorkOrderList
        projectId={project.id}
        projectSlug={slug}
        workOrders={serialized}
      />
    </ProjectPageShell>
  )
}
