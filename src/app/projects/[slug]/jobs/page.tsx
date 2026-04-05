import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
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
          <JobList
            projectId={project.id}
            projectSlug={slug}
            jobs={JSON.parse(JSON.stringify(project.clientProfile?.jobs ?? []))}
          />
        </main>
      </div>
    </div>
  )
}
