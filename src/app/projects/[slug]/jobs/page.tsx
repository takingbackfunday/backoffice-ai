import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ProjectPageShell, getHubRoute } from '@/components/layout/project-page-shell'
import { JobList } from '@/components/projects/job-list'

interface PageParams { params: Promise<{ slug: string }> }

export default async function ProjectJobsPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug } = await params

  const project = await prisma.workspace.findFirst({
    where: { userId, slug, type: 'CLIENT' },
    include: {
      clientProfile: {
        include: { jobs: { orderBy: { createdAt: 'desc' } } },
      },
    },
  })

  if (!project) notFound()

  const hub = getHubRoute(project.type)

  return (
    <ProjectPageShell
      project={project}
      slug={slug}
      breadcrumb={[hub, { label: project.name, href: `/projects/${slug}` }, { label: 'Jobs' }]}
    >
      <JobList
        projectId={project.id}
        projectSlug={slug}
        jobs={JSON.parse(JSON.stringify(project.clientProfile?.jobs ?? []))}
      />
    </ProjectPageShell>
  )
}
