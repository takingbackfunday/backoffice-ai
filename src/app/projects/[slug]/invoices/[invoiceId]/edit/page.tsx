import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
import { InvoiceEditor } from '@/components/projects/invoice-editor'
import { parsePreferences, DEFAULT_PAYMENT_NOTE } from '@/types/preferences'
import Link from 'next/link'

interface PageParams { params: Promise<{ slug: string; invoiceId: string }> }

export default async function EditInvoicePage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug, invoiceId } = await params

  const project = await prisma.workspace.findFirst({
    where: { userId, slug, type: 'CLIENT' },
    include: {
      clientProfile: {
        include: { jobs: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } } },
      },
    },
  })
  if (!project || !project.clientProfile) notFound()

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, clientProfile: { workspaceId: project.id } },
    include: {
      lineItems: true,
      payments: true,
    },
  })
  if (!invoice) notFound()

  const prefs = await prisma.userPreference.findUnique({ where: { userId } })
  const parsedPrefs = parsePreferences(prefs?.data)
  const invoicePaymentNote = parsedPrefs.invoicePaymentNote ?? DEFAULT_PAYMENT_NOTE
  const paymentMethods = parsedPrefs.paymentMethods ?? {}

  // PAID and VOID invoices cannot be edited
  if (['PAID', 'VOID'].includes(invoice.status)) {
    redirect(`/projects/${slug}/invoices/${invoiceId}`)
  }

  const cp = project.clientProfile

  const totalPaid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0)

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
              href={`/projects/${slug}/invoices/${invoiceId}`}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back to invoice
            </Link>
            <h2 className="text-lg font-semibold">Edit {invoice.invoiceNumber}</h2>
          </div>
          <InvoiceEditor
            mode="edit"
            projectId={project.id}
            projectSlug={slug}
            clientName={cp.contactName ?? project.name}
            clientEmail={cp.email ?? null}
            paymentTermDays={cp.paymentTermDays}
            billingType={cp.billingType}
            company={cp.company ?? null}
            jobs={cp.jobs.map(j => ({ id: j.id, name: j.name }))}
            existingInvoice={{
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              status: invoice.status,
              jobId: invoice.jobId ?? null,
              dueDate: invoice.dueDate.toISOString(),
              issueDate: invoice.issueDate.toISOString(),
              currency: invoice.currency,
              notes: invoice.notes ?? null,
              lineItems: invoice.lineItems.map(i => ({
                id: i.id,
                description: i.description,
                quantity: Number(i.quantity),
                qtyUnit: i.qtyUnit ?? null,
                unitPrice: Number(i.unitPrice),
                isTaxLine: i.isTaxLine,
              })),
              totalPaid,
            }}
            invoicePaymentNote={invoicePaymentNote}
            paymentMethods={paymentMethods}
          />
        </main>
      </div>
    </div>
  )
}
