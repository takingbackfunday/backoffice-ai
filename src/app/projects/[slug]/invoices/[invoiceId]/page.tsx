import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
import { InvoiceDetailClient } from '@/components/projects/invoice-detail-client'
import Link from 'next/link'
import type { PaymentMethods } from '@/lib/pdf/invoice-pdf'

interface PageParams { params: Promise<{ slug: string; invoiceId: string }> }

export default async function InvoiceDetailPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug, invoiceId } = await params

  const project = await prisma.project.findFirst({
    where: { userId, slug, type: 'CLIENT' },
  })
  if (!project) notFound()

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, clientProfile: { projectId: project.id } },
    include: {
      job: { select: { id: true, name: true } },
      lineItems: true,
      payments: true,
      clientProfile: { select: { email: true } },
    },
  })
  if (!invoice) notFound()

  const prefs = await prisma.userPreference.findUnique({ where: { userId } })
  const paymentMethods = ((prefs?.data as Record<string, unknown>)?.paymentMethods ?? {}) as PaymentMethods

  const serialized = {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    issueDate: invoice.issueDate.toISOString(),
    dueDate: invoice.dueDate.toISOString(),
    currency: invoice.currency,
    notes: invoice.notes ?? null,
    job: invoice.job,
    clientEmail: invoice.clientProfile.email ?? null,
    lineItems: invoice.lineItems.map(i => ({
      id: i.id,
      description: i.description,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      isTaxLine: i.isTaxLine,
    })),
    payments: invoice.payments.map(p => ({
      id: p.id,
      amount: Number(p.amount),
      paidDate: p.paidDate.toISOString(),
      paymentMethod: p.paymentMethod ?? null,
      notes: p.notes ?? null,
    })),
  }

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
          <div className="mb-4">
            <Link
              href={`/projects/${slug}/invoices`}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              All invoices
            </Link>
          </div>
          <InvoiceDetailClient projectId={project.id} projectSlug={slug} invoice={serialized} paymentMethods={paymentMethods} />
        </main>
      </div>
    </div>
  )
}
