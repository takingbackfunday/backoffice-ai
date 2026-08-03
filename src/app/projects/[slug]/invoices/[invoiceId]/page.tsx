import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ProjectPageShell, getHubRoute } from '@/components/layout/project-page-shell'
import { InvoiceDetailClient } from '@/components/projects/invoice-detail-client'
import { PipelineBreadcrumb } from '@/components/projects/pipeline-breadcrumb'
import { parsePreferences } from '@/types/preferences'
import { toDisplay, computeInvoiceTotals } from '@/lib/money'

interface PageParams { params: Promise<{ slug: string; invoiceId: string }> }

async function loadRenegotiationChain(invoiceId: string) {
  type ChainItem = {
    id: string
    invoiceNumber: string
    status: string
    issueDate: Date
    total: number
    paid: number
    currency: string
    isCurrent: boolean
  }

  const all: ChainItem[] = []

  // Walk backwards (replacesInvoice)
  let currentId: string | null = invoiceId
  const visited = new Set<string>()
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inv: any = await prisma.invoice.findUnique({
      where: { id: currentId },
      include: { lineItems: true, payments: true, replacesInvoice: { select: { id: true } }, replacedBy: { select: { id: true } } },
    })
    if (!inv) break
    const { total, paid } = computeInvoiceTotals(inv)
    all.unshift({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      issueDate: inv.issueDate,
      total: toDisplay(total),
      paid: toDisplay(paid),
      currency: inv.currency,
      isCurrent: inv.id === invoiceId,
    })
    currentId = inv.replacesInvoice?.id ?? null
  }

  // Walk forwards (replacedBy) from the original invoice
  const originalId = all[0]?.id ?? invoiceId
  let forwardId: string | null = originalId
  const forwardVisited = new Set<string>(visited)
  while (forwardId && !forwardVisited.has(forwardId)) {
    forwardVisited.add(forwardId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inv: any = await prisma.invoice.findUnique({
      where: { id: forwardId },
      include: { lineItems: true, payments: true, replacesInvoice: { select: { id: true } }, replacedBy: { select: { id: true } } },
    })
    if (!inv) break
    if (!visited.has(inv.id)) {
      const { total, paid } = computeInvoiceTotals(inv)
      all.push({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        issueDate: inv.issueDate,
        total: toDisplay(total),
        paid: toDisplay(paid),
        currency: inv.currency,
        isCurrent: inv.id === invoiceId,
      })
    }
    forwardId = inv.replacedBy?.id ?? null
  }

  return all
}

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
      quote: { select: { id: true, quoteNumber: true, estimateId: true } },
    },
  })
  if (!invoice) notFound()

  const [prefs, rawSuggestions, historyChain] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId } }),
    prisma.invoicePaymentSuggestion.findMany({
      where: { invoiceId: invoice.id, status: 'PENDING' },
      include: { transaction: { select: { id: true, description: true, date: true, amount: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    loadRenegotiationChain(invoice.id),
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
      amount: toDisplay(s.transaction.amount),
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
      quantity: toDisplay(i.quantity),
      unitPrice: toDisplay(i.unitPrice),
      isTaxLine: i.isTaxLine,
    })),
    payments: invoice.payments.map(p => ({
      id: p.id,
      amount: toDisplay(p.amount),
      paidDate: p.paidDate.toISOString(),
      paymentMethod: p.paymentMethod ?? null,
      notes: p.notes ?? null,
    })),
    replacesInvoice: invoice.replacesInvoice ?? null,
    replacedBy: invoice.replacedBy ?? null,
    quoteId: invoice.quoteId ?? null,
    quote: invoice.quote ?? null,
  }

  // Build pipeline breadcrumb nodes
  const pipelineNodes: import('@/components/projects/pipeline-breadcrumb').PipelineNode[] = []
  if (invoice.quote) {
    const estimate = await prisma.estimate.findUnique({
      where: { id: invoice.quote.estimateId },
      select: { id: true, title: true, version: true, status: true },
    })
    if (estimate) {
      const estLabel = estimate.version > 1 ? `Estimate ${estimate.title} (v${estimate.version})` : `Estimate ${estimate.title}`
      pipelineNodes.push({
        type: 'estimate',
        id: estimate.id,
        label: estLabel,
        status: estimate.status,
        href: `/projects/${slug}/estimates/${estimate.id}`,
      })
    }
    pipelineNodes.push({
      type: 'quote',
      id: invoice.quote.id,
      label: `Quote ${invoice.quote.quoteNumber}`,
      href: `/projects/${slug}/quotes/${invoice.quote.id}`,
    })
  }
  const { total, paid } = computeInvoiceTotals(invoice)
  pipelineNodes.push({
    type: 'invoice',
    id: invoice.id,
    label: `Invoice ${invoice.invoiceNumber}`,
    status: invoice.status,
    href: `/projects/${slug}/invoices/${invoice.id}`,
    meta: `${new Intl.NumberFormat('en-US', { style: 'currency', currency: invoice.currency }).format(toDisplay(paid))} / ${new Intl.NumberFormat('en-US', { style: 'currency', currency: invoice.currency }).format(toDisplay(total))}`,
  })

  const serializedHistory = historyChain.map(item => ({
    ...item,
    issueDate: item.issueDate.toISOString(),
  }))

  const hub = getHubRoute(project.type)

  return (
    <ProjectPageShell
      project={project}
      slug={slug}
      contentWidth="lg"
      breadcrumb={[
        hub,
        { label: project.name, href: `/projects/${slug}` },
        { label: 'Invoices', href: `/projects/${slug}/invoices` },
        { label: invoice.invoiceNumber },
      ]}
    >
      <div style={{ width: '65%' }}>
        <div className="mb-4">
          <PipelineBreadcrumb nodes={pipelineNodes} projectSlug={slug} currentId={invoice.id} />
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
          historyChain={serializedHistory}
        />
      </div>
    </ProjectPageShell>
  )
}
