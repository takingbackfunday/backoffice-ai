import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
import { UnitDetailClient } from '@/components/projects/unit-detail-client'

interface PageParams { params: Promise<{ slug: string; unitId: string }> }

export default async function UnitDetailPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug, unitId } = await params

  const project = await prisma.workspace.findFirst({
    where: { userId, slug, type: 'PROPERTY' },
    include: { propertyProfile: true },
  })
  if (!project || !project.propertyProfile) notFound()

  const unit = await prisma.unit.findFirst({
    where: { id: unitId, propertyProfileId: project.propertyProfile.id },
    include: {
      leases: {
        include: {
          tenant: { select: { id: true, name: true, email: true, phone: true, emergencyName: true, emergencyPhone: true, portalInviteStatus: true, clerkUserId: true } },
          invoices: {
            where: { status: { not: 'VOID' } },
            include: { lineItems: true, payments: true },
            orderBy: { dueDate: 'desc' },
            take: 12,
          },
        },
        orderBy: { startDate: 'desc' },
      },
      maintenanceRequests: { orderBy: { createdAt: 'desc' }, take: 10 },
      messages: { include: { tenant: true }, orderBy: { createdAt: 'asc' }, take: 20 },
    },
  })

  if (!unit) notFound()

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header title={`${project.name} — ${unit.unitLabel}`} />
        <main className="flex-1 p-6" role="main">
          <ProjectDetailHeader
            id={project.id}
            name={project.name}
            type={project.type}
            isActive={project.isActive}
            description={project.description}
          />
          <ProjectSubNav slug={slug} type={project.type} />
          <UnitDetailClient
            projectId={project.id}
            unit={JSON.parse(JSON.stringify(unit))}
          />
        </main>
      </div>
    </div>
  )
}
