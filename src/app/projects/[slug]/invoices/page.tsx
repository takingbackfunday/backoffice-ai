import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
import { InvoiceList } from '@/components/projects/invoice-list'
import type { PaymentMethods } from '@/lib/pdf/invoice-pdf'

interface PageParams { params: Promise<{ slug: string }> }

export default async function ProjectInvoicesPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug } = await params

  const project = await prisma.project.findFirst({
    where: { userId, slug, type: 'CLIENT' },
    include: {
      clientProfile: {
        include: {
          jobs: { orderBy: { createdAt: 'desc' } },
          invoices: {
            include: {
              job: { select: { id: true, name: true } },
              lineItems: true,
              payments: true,
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      },
    },
  })

  if (!project || !project.clientProfile) notFound()

  const prefs = await prisma.userPreference.findUnique({ where: { userId } })
  const paymentMethods = ((prefs?.data as Record<string, unknown>)?.paymentMethods ?? {}) as PaymentMethods

  const serializedInvoices = project.clientProfile.invoices.map(inv => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    issueDate: inv.issueDate.toISOString(),
    dueDate: inv.dueDate.toISOString(),
    currency: inv.currency,
    notes: inv.notes ?? null,
    job: inv.job,
    lineItems: inv.lineItems.map(i => ({
      id: i.id,
      description: i.description,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      isTaxLine: i.isTaxLine,
    })),
    payments: inv.payments.map(p => ({
      id: p.id,
      amount: Number(p.amount),
      paidDate: p.paidDate.toISOString(),
    })),
  }))

  const serializedJobs = project.clientProfile.jobs.map(j => ({
    id: j.id,
    name: j.name,
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
          <InvoiceList
            projectId={project.id}
            projectSlug={slug}
            jobs={serializedJobs}
            invoices={serializedInvoices}
            paymentMethods={paymentMethods}
          />
        </main>
      </div>
    </div>
  )
}
