import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
import { InvoiceEditor } from '@/components/projects/invoice-editor'
import Link from 'next/link'

interface PageParams { params: Promise<{ slug: string }> }

export default async function NewInvoicePage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug } = await params

  const project = await prisma.project.findFirst({
    where: { userId, slug, type: 'CLIENT' },
    include: {
      clientProfile: {
        include: { jobs: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } } },
      },
    },
  })

  if (!project || !project.clientProfile) notFound()

  const cp = project.clientProfile

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
          <div className="mb-4 flex items-center justify-between">
            <Link
              href={`/projects/${slug}/invoices`}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              All invoices
            </Link>
            <h2 className="text-lg font-semibold">New Invoice</h2>
          </div>
          <InvoiceEditor
            mode="create"
            projectId={project.id}
            projectSlug={slug}
            clientName={cp.contactName ?? project.name}
            clientEmail={cp.email ?? null}
            paymentTermDays={cp.paymentTermDays}
            billingType={cp.billingType}
            company={cp.company ?? null}
            jobs={cp.jobs.map(j => ({ id: j.id, name: j.name }))}
          />
        </main>
      </div>
    </div>
  )
}
