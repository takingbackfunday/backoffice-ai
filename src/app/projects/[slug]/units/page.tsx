import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
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
          <UnitBoard
            projectId={project.id}
            slug={slug}
            units={JSON.parse(JSON.stringify(project.propertyProfile?.units ?? []))}
          />
        </main>
      </div>
    </div>
  )
}
