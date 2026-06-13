import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ProjectPageShell, getHubRoute } from '@/components/layout/project-page-shell'
import { UnitBoard } from '@/components/projects/unit-board'

interface PageParams { params: Promise<{ slug: string }> }

export default async function ProjectUnitsPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug } = await params

  const project = await prisma.workspace.findFirst({
    where: { userId, slug, type: 'PROPERTY' },
    include: {
      propertyProfile: {
        include: {
          units: {
            include: {
              leases: {
                where: { status: { in: ['ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH'] } },
                include: { tenant: true },
                orderBy: { startDate: 'desc' },
                take: 1,
              },
              _count: { select: { maintenanceRequests: true } },
            },
            orderBy: { unitLabel: 'asc' },
          },
        },
      },
    },
  })

  if (!project) notFound()
  if (!project.propertyProfile) redirect(`/projects/${slug}`)

  const hub = getHubRoute(project.type)

  return (
    <ProjectPageShell
      project={project}
      slug={slug}
      breadcrumb={[hub, { label: project.name, href: `/projects/${slug}` }, { label: 'Units' }]}
    >
      <UnitBoard
        projectId={project.id}
        slug={slug}
        units={JSON.parse(JSON.stringify(project.propertyProfile?.units ?? []))}
      />
    </ProjectPageShell>
  )
}
