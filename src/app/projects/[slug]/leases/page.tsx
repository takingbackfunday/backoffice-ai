import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ProjectPageShell, getHubRoute } from '@/components/layout/project-page-shell'
import { LeaseList } from '@/components/projects/lease-list'

interface PageParams { params: Promise<{ slug: string }> }

export default async function ProjectLeasesPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug } = await params

  const project = await prisma.workspace.findFirst({
    where: { userId, slug, type: 'PROPERTY' },
    include: {
      propertyProfile: { include: { units: { select: { id: true } } } },
    },
  })

  if (!project) notFound()
  if (!project.propertyProfile) redirect(`/projects/${slug}`)

  const unitIds = project.propertyProfile.units.map(u => u.id)

  const leases = await prisma.lease.findMany({
    where: { unitId: { in: unitIds } },
    include: {
      unit: true,
      tenant: true,
      replacedBy: { select: { id: true } },
      _count: { select: { invoices: true } },
    },
    orderBy: { startDate: 'desc' },
  })

  // Fetch units and tenants for the lease form dropdowns
  const units = await prisma.unit.findMany({
    where: { propertyProfileId: project.propertyProfile.id },
    orderBy: { unitLabel: 'asc' },
  })

  const tenants = await prisma.tenant.findMany({
    where: { userId },
    orderBy: { name: 'asc' },
  })

  const hub = getHubRoute(project.type)

  return (
    <ProjectPageShell
      project={project}
      slug={slug}
      breadcrumb={[hub, { label: project.name, href: `/projects/${slug}` }, { label: 'Leases' }]}
    >
      <LeaseList
        projectId={project.id}
        leases={JSON.parse(JSON.stringify(leases))}
        units={JSON.parse(JSON.stringify(units))}
        tenants={JSON.parse(JSON.stringify(tenants))}
      />
    </ProjectPageShell>
  )
}
