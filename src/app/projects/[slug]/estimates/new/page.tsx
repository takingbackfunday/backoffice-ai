import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
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
        </main>
      </div>
    </div>
  )
}
