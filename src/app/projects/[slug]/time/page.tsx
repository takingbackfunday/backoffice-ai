import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ProjectPageShell, getHubRoute } from '@/components/layout/project-page-shell'
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

  const hub = getHubRoute(project.type)

  return (
    <ProjectPageShell
      project={project}
      slug={slug}
      breadcrumb={[hub, { label: project.name, href: `/projects/${slug}` }, { label: 'Time' }]}
    >
      <TimeTracker
        projectId={project.id}
        entries={JSON.parse(JSON.stringify(entries))}
        jobs={jobs}
        defaultRate={defaultRate}
        currency={currency}
      />
    </ProjectPageShell>
  )
}
