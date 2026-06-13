import { auth } from '@clerk/nextjs/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { ProjectPageShell, getHubRoute } from '@/components/layout/project-page-shell'
import { cn } from '@/lib/utils'
import {
  MAINTENANCE_PRIORITY_LABELS,
  MAINTENANCE_PRIORITY_COLORS,
  MAINTENANCE_STATUS_LABELS,
} from '@/types'
import { WorkOrderPanel } from '@/components/projects/work-order-panel'

interface PageParams { params: Promise<{ slug: string; requestId: string }> }

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export default async function MaintenanceRequestDetailPage({ params }: PageParams) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { slug, requestId } = await params

  const project = await prisma.workspace.findFirst({
    where: { userId, slug, type: 'PROPERTY' },
    include: { propertyProfile: { include: { units: { select: { id: true } } } } },
  })
  if (!project || !project.propertyProfile) notFound()

  const unitIds = project.propertyProfile.units.map(u => u.id)

  const request = await prisma.maintenanceRequest.findFirst({
    where: { id: requestId, unitId: { in: unitIds } },
    include: {
      unit: true,
      tenant: true,
      workOrders: {
        include: {
          vendor: { select: { id: true, name: true, specialty: true } },
          bills: {
            include: {
              transaction: { select: { id: true, date: true, amount: true, description: true } },
            },
            orderBy: { issueDate: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })
  if (!request) notFound()

  // Load vendors for the work order form
  const vendors = await prisma.vendor.findMany({
    where: { userId },
    select: { id: true, name: true, specialty: true },
    orderBy: { name: 'asc' },
  })

  const hub = getHubRoute(project.type)

  return (
    <ProjectPageShell
      project={project}
      slug={slug}
      breadcrumb={[
        hub,
        { label: project.name, href: `/projects/${slug}` },
        { label: 'Maintenance', href: `/projects/${slug}/maintenance` },
        { label: request.title },
      ]}
    >
      <div className="max-w-3xl">
        {/* Request header */}
        <div className="flex items-start gap-3 mb-2">
          <h2 className="text-lg font-semibold">{request.title}</h2>
          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium mt-0.5', MAINTENANCE_PRIORITY_COLORS[request.priority] ?? 'bg-muted')}>
            {MAINTENANCE_PRIORITY_LABELS[request.priority] ?? request.priority}
          </span>
        </div>

        <p className="text-sm text-muted-foreground mb-4">{request.description}</p>

        {/* Meta strip */}
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground mb-6">
          <span>Status: <span className="text-foreground">{MAINTENANCE_STATUS_LABELS[request.status] ?? request.status}</span></span>
          <span>Unit: <Link href={`/projects/${slug}/units/${request.unit.id}`} className="text-foreground hover:underline">{request.unit.unitLabel}</Link></span>
          {request.tenant && <span>Tenant: <span className="text-foreground">{request.tenant.name}</span></span>}
          {request.scheduledDate && <span>Scheduled: <span className="text-foreground">{fmtDate(request.scheduledDate)}</span></span>}
          {request.completedDate && <span>Completed: <span className="text-foreground">{fmtDate(request.completedDate)}</span></span>}
          {request.vendorName && <span>Vendor (legacy): <span className="text-foreground">{request.vendorName}</span></span>}
          {request.cost && <span>Cost (legacy): <span className="text-foreground">{fmt(Number(request.cost))}</span></span>}
        </div>

        {/* Work Orders */}
        <WorkOrderPanel
          projectId={project.id}
          workOrders={JSON.parse(JSON.stringify(request.workOrders))}
          vendors={JSON.parse(JSON.stringify(vendors))}
          context={{ type: 'maintenance', maintenanceRequestId: request.id }}
        />
      </div>
    </ProjectPageShell>
  )
}
