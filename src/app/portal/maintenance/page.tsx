import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { PortalMaintenanceClient } from '@/components/portal/portal-maintenance-client'
import { getPortalSession } from '@/lib/portal-auth'

export default async function PortalMaintenancePage() {
  const session = await getPortalSession()
  if (!session) redirect('/dashboard')
  const { tenantId } = session

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      leases: {
        where: { status: { in: ['ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH'] } },
        include: { unit: { include: { propertyProfile: { include: { project: true } } } } },
        orderBy: { startDate: 'desc' },
        take: 1,
      },
      maintenanceRequests: {
        include: { unit: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!tenant) redirect('/dashboard')

  const activeLease = tenant.leases[0]

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Maintenance</h1>
        <p className="text-sm text-muted-foreground mt-1">Submit and track maintenance requests.</p>
      </div>
      <PortalMaintenanceClient
        tenantId={tenantId}
        unitId={activeLease?.unitId ?? null}
        projectId={activeLease?.unit.propertyProfile?.project?.id ?? null}
        requests={JSON.parse(JSON.stringify(tenant.maintenanceRequests))}
      />
    </div>
  )
}
