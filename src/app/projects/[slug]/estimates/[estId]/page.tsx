import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
import { EstimateEditor } from '@/components/projects/estimate-editor'

interface PageParams { params: Promise<{ slug: string; estId: string }> }

export default async function EstimateDetailPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug, estId } = await params

  const project = await prisma.workspace.findFirst({
    where: { userId, slug, type: 'CLIENT' },
    include: { clientProfile: true },
  })
  if (!project || !project.clientProfile) notFound()

  const estimate = await prisma.estimate.findFirst({
    where: { id: estId, workspaceId: project.id },
    include: {
      sections: {
        include: { items: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      },
    },
  })
  if (!estimate) notFound()

  const estimateData = JSON.parse(JSON.stringify({
    ...estimate,
    sections: estimate.sections.map(s => ({
      ...s,
      items: s.items.map(i => ({
        ...i,
        hours: i.hours ? Number(i.hours) : null,
        costRate: i.costRate ? Number(i.costRate) : null,
        quantity: Number(i.quantity),
      })),
    })),
  }))

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
          <div className="max-w-4xl">
            <div className="mb-2 text-sm text-muted-foreground">
              v{estimate.version}
            </div>
            <EstimateEditor
              projectId={project.id}
              projectSlug={slug}
              clientName={project.clientProfile.contactName ?? project.name}
              billingType={project.clientProfile.billingType}
              existingEstimate={estimateData}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
