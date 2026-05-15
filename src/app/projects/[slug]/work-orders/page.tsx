import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
import { WorkOrderList } from '@/components/projects/work-order-list'

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
    agreedCost: wo.agreedCost ? Number(wo.agreedCost) : null,
    scheduledDate: wo.scheduledDate?.toISOString() ?? null,
    createdAt: wo.createdAt.toISOString(),
    vendor: wo.vendor ? { id: wo.vendor.id, name: wo.vendor.name } : null,
    job: wo.job ? { id: wo.job.id, name: wo.job.name } : null,
    bills: wo.bills.map(b => ({
      id: b.id,
      amount: Number(b.amount),
      status: b.status,
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
          <WorkOrderList
            projectId={project.id}
            projectSlug={slug}
            workOrders={serialized}
          />
        </main>
      </div>
    </div>
  )
}
