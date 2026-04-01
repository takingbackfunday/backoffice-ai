import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
import { TenantList } from '@/components/projects/tenant-list'
import { TenantsApplicantsClient } from '@/components/projects/tenants-applicants-client'

interface PageParams { params: Promise<{ slug: string }> }

export default async function ProjectTenantsPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug } = await params

  const project = await prisma.project.findFirst({
    where: { userId, slug, type: 'PROPERTY' },
    include: {
      propertyProfile: {
        include: {
          units: { select: { id: true, unitLabel: true } },
          _count: {
            select: {
              applicants: {
                where: { status: { notIn: ['REJECTED', 'WITHDRAWN', 'LEASE_SIGNED'] } },
              },
            },
          },
        },
      },
    },
  })

  if (!project || !project.propertyProfile) notFound()

  const unitIds = project.propertyProfile.units.map(u => u.id)

  const tenants = await prisma.tenant.findMany({
    where: {
      userId,
      leases: { some: { unitId: { in: unitIds } } },
    },
    include: {
      leases: {
        where: { unitId: { in: unitIds } },
        include: { unit: true },
        orderBy: { startDate: 'desc' },
      },
    },
    orderBy: { name: 'asc' },
  })

  const activeApplicantsCount = project.propertyProfile._count.applicants
  const units = project.propertyProfile.units

  const listings = await prisma.listing.findMany({
    where: { unitId: { in: unitIds }, userId, isActive: true },
    select: { id: true, title: true, publicSlug: true },
    orderBy: { createdAt: 'desc' },
  })

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
          <TenantsApplicantsClient
            projectId={project.id}
            tenants={JSON.parse(JSON.stringify(tenants))}
            units={units}
            listings={listings}
            defaultTab={activeApplicantsCount > 0 ? 'applicants' : 'tenants'}
          />
        </main>
      </div>
    </div>
  )
}
