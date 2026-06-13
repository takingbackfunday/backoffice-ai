import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ProjectPageShell, getHubRoute } from '@/components/layout/project-page-shell'
import { NewQuoteForm } from '@/components/projects/new-quote-form'

interface PageParams { params: Promise<{ slug: string }> }

export default async function NewQuotePage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug } = await params

  const project = await prisma.workspace.findFirst({
    where: { userId, slug, type: 'CLIENT' },
    include: { clientProfile: true },
  })
  if (!project || !project.clientProfile) notFound()

  const [jobs, estimates] = await Promise.all([
    prisma.job.findMany({
      where: { clientProfile: { workspaceId: project.id }, status: 'ACTIVE' },
      select: { id: true, name: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.estimate.findMany({
      where: { workspaceId: project.id },
      select: { id: true, title: true, status: true },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const hub = getHubRoute(project.type)

  return (
    <ProjectPageShell
      project={project}
      slug={slug}
      breadcrumb={[hub, { label: project.name, href: `/projects/${slug}` }, { label: 'Quotes', href: `/projects/${slug}/quotes` }, { label: 'New' }]}
    >
      <div className="max-w-md">
        <h2 className="text-lg font-semibold mb-6">New Quote</h2>
        <NewQuoteForm
          projectId={project.id}
          projectSlug={slug}
          jobs={jobs}
          estimates={estimates}
        />
      </div>
    </ProjectPageShell>
  )
}
