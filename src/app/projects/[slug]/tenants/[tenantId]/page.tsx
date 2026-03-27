import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
import { TenantDetailClient } from '@/components/projects/tenant-detail-client'

interface PageParams { params: Promise<{ slug: string; tenantId: string }> }

export default async function TenantDetailPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug, tenantId } = await params

  const project = await prisma.project.findFirst({
    where: { userId, slug, type: 'PROPERTY' },
  })
  if (!project) notFound()

  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, userId },
    include: {
      leases: {
        include: {
          unit: true,
          rentPayments: { orderBy: { dueDate: 'desc' } },
        },
        orderBy: { startDate: 'desc' },
      },
      tenantFiles: { orderBy: { createdAt: 'desc' } },
      messages: { orderBy: { createdAt: 'desc' }, take: 50 },
      maintenanceRequests: { orderBy: { createdAt: 'desc' } },
    },
  })

  if (!tenant) notFound()

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title={`${project.name} — ${tenant.name}`} />
        <main className="flex-1 p-6" role="main">
          <ProjectDetailHeader
            id={project.id}
            name={project.name}
            type={project.type}
            isActive={project.isActive}
            description={project.description}
          />
          <ProjectSubNav slug={slug} type={project.type} />
          <TenantDetailClient
            projectId={project.id}
            tenant={JSON.parse(JSON.stringify(tenant))}
          />
        </main>
      </div>
    </div>
  )
}
