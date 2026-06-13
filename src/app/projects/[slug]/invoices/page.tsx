import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ProjectPageShell, getHubRoute } from '@/components/layout/project-page-shell'
import { InvoiceList } from '@/components/projects/invoice-list'
import { parsePreferences } from '@/types/preferences'
import { toDisplay } from '@/lib/money'

interface PageParams { params: Promise<{ slug: string }> }

export default async function ProjectInvoicesPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug } = await params

  const project = await prisma.workspace.findFirst({
    where: { userId, slug },
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
      propertyProfile: {
        include: {
          units: { select: { id: true } },
        },
      },
    },
  })

  if (!project) notFound()

  const prefs = await prisma.userPreference.findUnique({ where: { userId } })
  const paymentMethods = parsePreferences(prefs?.data).paymentMethods ?? {}
  const hub = getHubRoute(project.type)

  /* ── CLIENT project ─────────────────────────────────────────────── */
  if (project.type === 'CLIENT') {
    if (!project.clientProfile) notFound()

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
        quantity: toDisplay(i.quantity),
        unitPrice: toDisplay(i.unitPrice),
        isTaxLine: i.isTaxLine,
      })),
      payments: inv.payments.map(p => ({
        id: p.id,
        amount: toDisplay(p.amount),
        paidDate: p.paidDate.toISOString(),
      })),
    }))

    const serializedJobs = project.clientProfile.jobs.map(j => ({
      id: j.id,
      name: j.name,
    }))

    return (
      <ProjectPageShell
        project={project}
        slug={slug}
        breadcrumb={[hub, { label: project.name, href: `/projects/${slug}` }, { label: 'Invoices' }]}
      >
        <InvoiceList
          projectId={project.id}
          projectSlug={slug}
          jobs={serializedJobs}
          invoices={serializedInvoices}
          paymentMethods={paymentMethods}
          clientEmail={project.clientProfile.email ?? ''}
          clientName={project.clientProfile.contactName ?? project.name}
        />
      </ProjectPageShell>
    )
  }

  /* ── PROPERTY project ────────────────────────────────────────────── */
  if (project.type === 'PROPERTY') {
    if (!project.propertyProfile) redirect(`/projects/${slug}`)

    const unitIds = project.propertyProfile.units.map(u => u.id)
    const propertyProfileId = project.propertyProfile.id

    const propertyInvoices = await prisma.invoice.findMany({
      where: {
        OR: [
          { lease: { unitId: { in: unitIds } } },
          { tenant: { userId, leases: { some: { unitId: { in: unitIds } } } } },
          { applicant: { propertyProfileId } },
        ],
      },
      include: {
        lease: { select: { id: true, unit: { select: { unitLabel: true } } } },
        tenant: { select: { id: true, name: true, email: true } },
        applicant: { select: { id: true, name: true, email: true, unit: { select: { unitLabel: true } } } },
        lineItems: true,
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    const serializedInvoices = propertyInvoices.map(inv => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      issueDate: inv.issueDate.toISOString(),
      dueDate: inv.dueDate.toISOString(),
      currency: inv.currency,
      notes: inv.notes ?? null,
      job: inv.lease
        ? { id: inv.lease.id, name: `Unit ${inv.lease.unit.unitLabel}` }
        : inv.applicant
          ? { id: inv.applicant.id, name: `Applicant: ${inv.applicant.name}${inv.applicant.unit ? ` (${inv.applicant.unit.unitLabel})` : ''}` }
          : null,
      lineItems: inv.lineItems.map(i => ({
        id: i.id,
        description: i.description,
        quantity: toDisplay(i.quantity),
        unitPrice: toDisplay(i.unitPrice),
        isTaxLine: i.isTaxLine,
      })),
      payments: inv.payments.map(p => ({
        id: p.id,
        amount: toDisplay(p.amount),
        paidDate: p.paidDate.toISOString(),
      })),
    }))

    // Use first tenant/applicant as the default email recipient for the invoice modal
    const firstTenant = propertyInvoices.find(inv => inv.tenant)?.tenant
    const firstApplicant = propertyInvoices.find(inv => inv.applicant)?.applicant
    const clientEmail = firstTenant?.email ?? firstApplicant?.email ?? ''
    const clientName = firstTenant?.name ?? firstApplicant?.name ?? project.name

    return (
      <ProjectPageShell
        project={project}
        slug={slug}
        breadcrumb={[hub, { label: project.name, href: `/projects/${slug}` }, { label: 'Invoices' }]}
      >
        <InvoiceList
          projectId={project.id}
          projectSlug={slug}
          jobs={[]}
          invoices={serializedInvoices}
          paymentMethods={paymentMethods}
          clientEmail={clientEmail}
          clientName={clientName}
        />
      </ProjectPageShell>
    )
  }

  notFound()
}
