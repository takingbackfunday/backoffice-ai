import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ProjectPageShell, getHubRoute } from '@/components/layout/project-page-shell'
import { InvoiceEditor } from '@/components/projects/invoice-editor'
import { parsePreferences, DEFAULT_PAYMENT_NOTE } from '@/types/preferences'
import { PropertyInvoiceNew } from '@/components/projects/property-invoice-new'
import { NewInvoiceShortcuts } from '@/components/projects/new-invoice-shortcuts'

interface PageParams { params: Promise<{ slug: string }> }

export default async function NewInvoicePage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug } = await params

  const project = await prisma.workspace.findFirst({
    where: { userId, slug },
    include: {
      clientProfile: {
        include: { jobs: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } } },
      },
      propertyProfile: {
        include: {
          units: {
            include: {
              leases: {
                where: { status: { in: ['ACTIVE', 'MONTH_TO_MONTH'] } },
                include: { tenant: { select: { id: true, name: true, email: true } } },
                orderBy: { startDate: 'desc' },
                take: 1,
              },
            },
            orderBy: { unitLabel: 'asc' },
          },
        },
      },
    },
  })

  if (!project) notFound()

  const prefs = await prisma.userPreference.findUnique({ where: { userId } })
  const parsedPrefs = parsePreferences(prefs?.data)
  const invoiceDefaults = parsedPrefs.invoiceDefaults
  const invoicePaymentNote = parsedPrefs.invoicePaymentNote ?? DEFAULT_PAYMENT_NOTE
  const invoiceNotesDefault = parsedPrefs.invoiceNotesDefault ?? ''
  const paymentMethods = parsedPrefs.paymentMethods ?? {}
  const hub = getHubRoute(project.type)

  /* ── PROPERTY project ─────────────────────────────────────────── */
  if (project.type === 'PROPERTY') {
    const activeLeases = (project.propertyProfile?.units ?? [])
      .flatMap(u => u.leases.map(l => ({
        leaseId: l.id,
        unitLabel: u.unitLabel,
        tenantId: l.tenant?.id ?? '',
        tenantName: l.tenant?.name ?? '',
        tenantEmail: l.tenant?.email ?? '',
        monthlyRent: u.monthlyRent ? Number(u.monthlyRent) : null,
        currency: (l as { currency?: string }).currency ?? 'USD',
      })))
      .filter(l => l.tenantId)

    return (
      <ProjectPageShell
        project={project}
        slug={slug}
        breadcrumb={[hub, { label: project.name, href: `/projects/${slug}` }, { label: 'Invoices', href: `/projects/${slug}/invoices` }, { label: 'New' }]}
      >
        <div className="mb-4">
          <h2 className="text-lg font-semibold">New Invoice</h2>
        </div>
        <PropertyInvoiceNew
          projectId={project.id}
          projectSlug={slug}
          activeLeases={activeLeases}
        />
      </ProjectPageShell>
    )
  }

  /* ── CLIENT project ───────────────────────────────────────────── */
  if (!project.clientProfile) notFound()
  const cp = project.clientProfile

  const [acceptedQuotes, txCount] = await Promise.all([
    prisma.quote.findMany({
      where: { clientProfileId: cp.id, status: 'ACCEPTED' },
      select: { id: true, quoteNumber: true, title: true, totalQuoted: true, currency: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.transaction.count({ where: { account: { userId } } }),
  ])

  return (
    <ProjectPageShell
      project={project}
      slug={slug}
      breadcrumb={[hub, { label: project.name, href: `/projects/${slug}` }, { label: 'Invoices', href: `/projects/${slug}/invoices` }, { label: 'New' }]}
    >
      <div className="mb-4">
        <h2 className="text-lg font-semibold">New Invoice</h2>
      </div>
      <div className="max-w-3xl">
        <NewInvoiceShortcuts
          projectId={project.id}
          projectSlug={slug}
          clientName={cp.contactName ?? project.name}
          hasTransactions={txCount > 0}
          acceptedQuotes={acceptedQuotes.map(q => ({
            id: q.id,
            quoteNumber: q.quoteNumber,
            title: q.title,
            totalQuoted: q.totalQuoted ? Number(q.totalQuoted) : null,
            currency: q.currency,
          }))}
        />
        <InvoiceEditor
          mode="create"
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
          lastInvoiceDefaults={invoiceDefaults ? {
            taxEnabled: invoiceDefaults.taxEnabled ?? false,
            taxLabel: invoiceDefaults.taxLabel ?? 'Tax',
            taxMode: invoiceDefaults.taxMode ?? 'percent',
            taxRate: invoiceDefaults.taxRate ?? '',
            currency: invoiceDefaults.currency ?? 'USD',
          } : undefined}
          invoiceNotesDefault={invoiceNotesDefault}
          invoicePaymentNote={invoicePaymentNote}
          paymentMethods={paymentMethods}
        />
      </div>
    </ProjectPageShell>
  )
}
