import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
import { EstimateList } from '@/components/projects/estimate-list'
import { ChevronLeft } from 'lucide-react'

interface PageParams { params: Promise<{ slug: string; jobId: string }> }

export default async function JobDetailPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug, jobId } = await params

  const project = await prisma.workspace.findFirst({
    where: { userId, slug, type: 'CLIENT' },
    include: {
      clientProfile: {
        include: {
          jobs: { where: { id: jobId } },
        },
      },
    },
  })
  if (!project || !project.clientProfile) notFound()

  const job = project.clientProfile.jobs[0]
  if (!job) notFound()

  const estimates = await prisma.estimate.findMany({
    where: { jobId },
    include: {
      sections: {
        include: { items: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      },
      _count: { select: { quotes: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const estimatesData = JSON.parse(JSON.stringify(estimates))

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
          <div className="max-w-3xl">
            <div className="mb-6">
              <Link
                href={`/projects/${slug}/jobs`}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3"
              >
                <ChevronLeft className="w-3 h-3" /> All jobs
              </Link>
              <h2 className="text-lg font-semibold">{job.name}</h2>
              {job.description && (
                <p className="text-sm text-muted-foreground mt-0.5">{job.description}</p>
              )}
            </div>
            <EstimateList
              projectId={project.id}
              projectSlug={slug}
              jobId={jobId}
              estimates={estimatesData}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
