import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
import { TimeTracker } from '@/components/projects/time-tracker'

interface PageParams { params: Promise<{ slug: string }> }

export default async function ProjectTimePage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug } = await params

  const project = await prisma.workspace.findFirst({
    where: { userId, slug },
    include: {
      clientProfile: {
        include: {
          jobs: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } },
        },
      },
    },
  })

  if (!project) notFound()
  if (project.type !== 'CLIENT') notFound()
  if (!project.clientProfile) notFound()

  const entries = await prisma.timeEntry.findMany({
    where: { workspaceId: project.id },
    include: { job: { select: { id: true, name: true } } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  })

  const jobs = project.clientProfile.jobs.map(j => ({ id: j.id, name: j.name }))
  const defaultRate = project.clientProfile.defaultRate
    ? Number(project.clientProfile.defaultRate)
    : null
  const currency = project.clientProfile.currency ?? 'USD'

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header title={project.name} />
        <main className="flex-1 overflow-y-auto p-6">
          <ProjectDetailHeader
            id={project.id}
            name={project.name}
            type={project.type}
            isActive={project.isActive}
            description={project.description}
            isDefault={project.isDefault}
          />
          <ProjectSubNav slug={slug} type={project.type} />
          <TimeTracker
            projectId={project.id}
            entries={JSON.parse(JSON.stringify(entries))}
            jobs={jobs}
            defaultRate={defaultRate}
            currency={currency}
          />
        </main>
      </div>
    </div>
  )
}
