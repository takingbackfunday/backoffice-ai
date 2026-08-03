import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ProjectPageShell, getHubRoute } from '@/components/layout/project-page-shell'
import { InvoiceEditor } from '@/components/projects/invoice-editor'
import { parsePreferences, DEFAULT_PAYMENT_NOTE } from '@/types/preferences'
import { computeInvoiceTotals, toDisplay } from '@/lib/money'

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

  const { paid: totalPaid } = computeInvoiceTotals(invoice)
  const hub = getHubRoute(project.type)

  return (
    <ProjectPageShell
      project={project}
      slug={slug}
      contentWidth="md"
      breadcrumb={[
        hub,
        { label: project.name, href: `/projects/${slug}` },
        { label: 'Invoices', href: `/projects/${slug}/invoices` },
        { label: invoice.invoiceNumber, href: `/projects/${slug}/invoices/${invoiceId}` },
        { label: 'Edit' },
      ]}
    >
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Edit {invoice.invoiceNumber}</h2>
      </div>
      <InvoiceEditor
        mode="edit"
        projectId={project.id}
        projectSlug={slug}
        workspaceName={project.name}
        clientName={cp.contactName ?? project.name}
        clientContactName={cp.contactName ?? null}
        clientEmail={cp.email ?? null}
        clientAddress={cp.address ?? null}
        clientPhone={cp.phone ?? null}
        paymentTermDays={cp.paymentTermDays}
        billingType={cp.billingType}
        company={cp.company ?? null}
        jobs={cp.jobs.map(j => ({ id: j.id, name: j.name }))}
        fromName={parsedPrefs.businessName || parsedPrefs.yourName || project.name}
        fromAddress={parsedPrefs.fromAddress ?? null}
        fromEmail={parsedPrefs.fromEmail ?? null}
        fromPhone={parsedPrefs.fromPhone ?? null}
        fromWebsite={parsedPrefs.fromWebsite ?? null}
        fromVatNumber={parsedPrefs.fromVatNumber ?? null}
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
            quantity: toDisplay(i.quantity),
            qtyUnit: i.qtyUnit ?? null,
            unitPrice: toDisplay(i.unitPrice),
            isTaxLine: i.isTaxLine,
          })),
          totalPaid: toDisplay(totalPaid),
        }}
        invoicePaymentNote={invoicePaymentNote}
        paymentMethods={paymentMethods}
      />
    </ProjectPageShell>
  )
}
