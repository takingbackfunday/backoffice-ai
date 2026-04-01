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
  const paymentMethods = ((prefs?.data as Record<string, unknown>)?.paymentMethods ?? {}) as PaymentMethods

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
              clientEmail={project.clientProfile.email ?? ''}
              clientName={project.clientProfile.contactName ?? project.name}
            />
          </main>
        </div>
      </div>
    )
  }

  /* ── PROPERTY project ────────────────────────────────────────────── */
  if (project.type === 'PROPERTY') {
    if (!project.propertyProfile) notFound()

    const unitIds = project.propertyProfile.units.map(u => u.id)

    const propertyInvoices = await prisma.invoice.findMany({
      where: {
        OR: [
          { lease: { unitId: { in: unitIds } } },
          { tenant: { userId, leases: { some: { unitId: { in: unitIds } } } } },
        ],
      },
      include: {
        lease: { select: { id: true, unit: { select: { unitLabel: true } } } },
        tenant: { select: { id: true, name: true, email: true } },
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
      job: inv.lease ? { id: inv.lease.id, name: `Unit ${inv.lease.unit.unitLabel}` } : null,
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

    // Use first tenant as the default email recipient for the invoice modal
    // The real per-invoice recipient is derived from lease.tenant in the send route
    const firstTenant = propertyInvoices.find(inv => inv.tenant)?.tenant
    const clientEmail = firstTenant?.email ?? ''
    const clientName = firstTenant?.name ?? project.name

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
              jobs={[]}
              invoices={serializedInvoices}
              paymentMethods={paymentMethods}
              clientEmail={clientEmail}
              clientName={clientName}
            />
          </main>
        </div>
      </div>
    )
  }

  notFound()
}
