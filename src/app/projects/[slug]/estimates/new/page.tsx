import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ProjectPageShell, getHubRoute } from '@/components/layout/project-page-shell'
import { EstimateEditor } from '@/components/projects/estimate-editor'

interface PageParams { params: Promise<{ slug: string }> }

export default async function NewEstimatePage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug } = await params

  const project = await prisma.workspace.findFirst({
    where: { userId, slug, type: 'CLIENT' },
    include: { clientProfile: true },
  })
  if (!project || !project.clientProfile) notFound()

  const hub = getHubRoute(project.type)

  return (
    <ProjectPageShell
      project={project}
      slug={slug}
      breadcrumb={[hub, { label: project.name, href: `/projects/${slug}` }, { label: 'Estimates', href: `/projects/${slug}/estimates` }, { label: 'New' }]}
      contentWidth="lg"
    >
      <div>
        <div className="mb-6">
          <h2 className="text-lg font-semibold">New Estimate</h2>
        </div>
        <EstimateEditor
          projectId={project.id}
          projectSlug={slug}
          clientName={project.clientProfile.contactName ?? project.name}
          billingType={project.clientProfile.billingType}
        />
      </div>
    </ProjectPageShell>
  )
}
