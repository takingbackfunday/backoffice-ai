import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { ProjectPageShell, getHubRoute } from '@/components/layout/project-page-shell'
import { TenantDetailClient } from '@/components/projects/tenant-detail-client'
import { computeInvoiceTotals, toDisplay } from '@/lib/money'

interface PageParams { params: Promise<{ slug: string; tenantId: string }> }

export default async function TenantDetailPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug, tenantId } = await params

  const project = await prisma.workspace.findFirst({
    where: { userId, slug, type: 'PROPERTY' },
  })
  if (!project) notFound()

  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, userId },
    include: {
      leases: {
        include: {
          unit: true,
          invoices: {
            where: { status: { not: 'VOID' } },
            include: { lineItems: true, payments: true },
            orderBy: { dueDate: 'desc' },
          },
        },
        orderBy: { startDate: 'desc' },
      },
      tenantFiles: { orderBy: { createdAt: 'desc' } },
      messages: { orderBy: { createdAt: 'desc' }, take: 50 },
      maintenanceRequests: { orderBy: { createdAt: 'desc' } },
    },
  })

  if (!tenant) notFound()

  const hub = getHubRoute(project.type)

  return (
    <ProjectPageShell
      project={project}
      slug={slug}
      breadcrumb={[
        hub,
        { label: project.name, href: `/projects/${slug}` },
        { label: 'Tenants', href: `/projects/${slug}/tenants` },
        { label: tenant.name },
      ]}
    >
      <TenantDetailClient
        projectId={project.id}
        tenant={{
          ...JSON.parse(JSON.stringify(tenant)),
          leases: tenant.leases.map(l => ({
            ...JSON.parse(JSON.stringify(l)),
            invoices: l.invoices.map(inv => {
              const { total, paid } = computeInvoiceTotals(inv)
              return {
                id: inv.id,
                lineItemTotal: toDisplay(total),
                paymentTotal: toDisplay(paid),
              }
            }),
          })),
        }}
      />
    </ProjectPageShell>
  )
}
