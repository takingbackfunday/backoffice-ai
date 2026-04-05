import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
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

  if (!project || !project.propertyProfile) notFound()

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
          <MaintenanceBoard
            projectId={project.id}
            requests={JSON.parse(JSON.stringify(requests))}
            units={JSON.parse(JSON.stringify(units))}
          />
        </main>
      </div>
    </div>
  )
}
