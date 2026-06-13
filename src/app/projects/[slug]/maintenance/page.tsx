import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ProjectPageShell, getHubRoute } from '@/components/layout/project-page-shell'
import { MaintenanceBoard } from '@/components/projects/maintenance-board'

interface PageParams { params: Promise<{ slug: string }> }

export default async function ProjectMaintenancePage({ params }: PageParams) {
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

  const requests = await prisma.maintenanceRequest.findMany({
    where: { unitId: { in: unitIds } },
    include: { unit: true, tenant: true },
    orderBy: { createdAt: 'desc' },
  })

  const units = await prisma.unit.findMany({
    where: { propertyProfileId: project.propertyProfile.id },
    orderBy: { unitLabel: 'asc' },
  })

  const hub = getHubRoute(project.type)

  return (
    <ProjectPageShell
      project={project}
      slug={slug}
      breadcrumb={[hub, { label: project.name, href: `/projects/${slug}` }, { label: 'Maintenance' }]}
    >
      <MaintenanceBoard
        projectId={project.id}
        projectSlug={slug}
        requests={JSON.parse(JSON.stringify(requests))}
        units={JSON.parse(JSON.stringify(units))}
      />
    </ProjectPageShell>
  )
}
