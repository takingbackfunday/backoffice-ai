import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ProjectPageShell, getHubRoute } from '@/components/layout/project-page-shell'
import { TenantsApplicantsClient } from '@/components/projects/tenants-applicants-client'

interface PageParams { params: Promise<{ slug: string }> }

export default async function ProjectTenantsPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug } = await params

  const project = await prisma.workspace.findFirst({
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

  if (!project) notFound()
  if (!project.propertyProfile) redirect(`/projects/${slug}`)

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

  const hub = getHubRoute(project.type)

  return (
    <ProjectPageShell
      project={project}
      slug={slug}
      breadcrumb={[hub, { label: project.name, href: `/projects/${slug}` }, { label: 'Tenants' }]}
    >
      <TenantsApplicantsClient
        projectId={project.id}
        projectSlug={slug}
        tenants={JSON.parse(JSON.stringify(tenants))}
        units={units}
        listings={listings}
        defaultTab={activeApplicantsCount > 0 ? 'applicants' : 'tenants'}
      />
    </ProjectPageShell>
  )
}
