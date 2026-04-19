import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ProjectDetailHeader } from '@/components/projects/project-detail-header'
import { ProjectSubNav } from '@/components/projects/project-sub-nav'
import { InvoiceDetailClient } from '@/components/projects/invoice-detail-client'
import Link from 'next/link'
import { parsePreferences } from '@/types/preferences'

interface PageParams { params: Promise<{ slug: string; invoiceId: string }> }

export default async function InvoiceDetailPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug, invoiceId } = await params

  const project = await prisma.workspace.findFirst({
    where: { userId, slug },
    include: {
      propertyProfile: { include: { units: { select: { id: true } } } },
    },
  })
  if (!project) notFound()

  // Build the invoice query depending on project type
  const isProperty = project.type === 'PROPERTY'
  const unitIds = project.propertyProfile?.units.map(u => u.id) ?? []
  const propertyProfileId = project.propertyProfile?.id

  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      OR: isProperty
        ? [
            { lease: { unitId: { in: unitIds } } },
            { tenant: { userId, leases: { some: { unitId: { in: unitIds } } } } },
            ...(propertyProfileId ? [{ applicant: { propertyProfileId } }] : []),
          ]
        : [{ clientProfile: { workspaceId: project.id } }],
    },
    include: {
      job: { select: { id: true, name: true } },
      lineItems: true,
      payments: true,
      clientProfile: { select: { email: true, contactName: true } },
      applicant: { select: { id: true, name: true, email: true, unit: { select: { unitLabel: true } } } },
      tenant: { select: { id: true, name: true, email: true } },
      lease: { select: { id: true, unit: { select: { unitLabel: true } }, tenant: { select: { name: true, email: true } } } },
      replacesInvoice: { select: { id: true, invoiceNumber: true } },
      replacedBy: { select: { id: true, invoiceNumber: true } },
      quote: { select: { id: true, quoteNumber: true } },
    },
  })
  if (!invoice) notFound()

  const [prefs, rawSuggestions] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId } }),
    prisma.invoicePaymentSuggestion.findMany({
      where: { invoiceId: invoice.id, status: 'PENDING' },
      include: { transaction: { select: { id: true, description: true, date: true, amount: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ])
  const parsedPrefs = parsePreferences(prefs?.data)
  const paymentMethods = parsedPrefs.paymentMethods ?? {}
  const invoicePaymentNote = parsedPrefs.invoicePaymentNote ?? ''

  const suggestions = rawSuggestions.map(s => ({
    id: s.id,
    confidence: s.confidence,
    reasoning: s.reasoning,
    transaction: {
      id: s.transaction.id,
      description: s.transaction.description,
      date: s.transaction.date.toISOString(),
      amount: Number(s.transaction.amount),
    },
  }))

  // Derive client name/email based on what the invoice is linked to
  const clientEmail =
    invoice.clientProfile?.email ??
    invoice.applicant?.email ??
    invoice.tenant?.email ??
    invoice.lease?.tenant?.email ??
    null

  const clientName =
    invoice.clientProfile?.contactName ??
    invoice.applicant?.name ??
    invoice.tenant?.name ??
    invoice.lease?.tenant?.name ??
    project.name

  // Derive job label (tenant = "job" for property invoices)
  const job = invoice.job
    ?? (invoice.lease ? { id: invoice.lease.id, name: `Unit ${invoice.lease.unit.unitLabel}` } : null)
    ?? (invoice.applicant ? { id: invoice.applicant.id, name: `Applicant: ${invoice.applicant.name}${invoice.applicant.unit ? ` (${invoice.applicant.unit.unitLabel})` : ''}` } : null)

  const serialized = {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    issueDate: invoice.issueDate.toISOString(),
    dueDate: invoice.dueDate.toISOString(),
    currency: invoice.currency,
    notes: invoice.notes ?? null,
    job,
    clientEmail,
    clientName,
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
    replacesInvoice: invoice.replacesInvoice ?? null,
    replacedBy: invoice.replacedBy ?? null,
    quoteId: invoice.quoteId ?? null,
    quote: invoice.quote ?? null,
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
          <div style={{ width: '65%' }}>
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
            <InvoiceDetailClient
              projectId={project.id}
              projectSlug={slug}
              invoice={serialized}
              paymentMethods={paymentMethods}
              invoicePaymentNote={invoicePaymentNote}
              suggestions={suggestions}
              replacesInvoice={serialized.replacesInvoice}
              replacedBy={serialized.replacedBy}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
