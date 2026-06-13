import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ProjectPageShell, getHubRoute } from '@/components/layout/project-page-shell'
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

  const hub = getHubRoute(project.type)

  return (
    <ProjectPageShell
      project={project}
      slug={slug}
      breadcrumb={[
        hub,
        { label: project.name, href: `/projects/${slug}` },
        { label: 'Units', href: `/projects/${slug}/units` },
        { label: unit.unitLabel },
      ]}
    >
      <UnitDetailClient
        projectId={project.id}
        unit={JSON.parse(JSON.stringify(unit))}
      />
    </ProjectPageShell>
  )
}
