import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { PortalMessageThread } from '@/components/portal/portal-message-thread'

export default async function PortalMessagesPage() {
  const { sessionClaims } = await auth()
  const tenantId = (sessionClaims?.metadata as Record<string, string> | undefined)?.tenantId
  if (!tenantId) redirect('/dashboard')

  // Get active lease to determine unitId for messaging
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      leases: {
        where: { status: { in: ['ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH'] } },
        include: { unit: { include: { propertyProfile: { include: { project: true } } } } },
        orderBy: { startDate: 'desc' },
        take: 1,
      },
    },
  })

  if (!tenant) redirect('/dashboard')

  const activeLease = tenant.leases[0]

  if (!activeLease) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold mb-2">Messages</h1>
        <p className="text-sm text-muted-foreground">No active lease found. Messages require an active lease.</p>
      </div>
    )
  }

  const messages = await prisma.message.findMany({
    where: { tenantId, unitId: activeLease.unitId },
    orderBy: { createdAt: 'asc' },
  })

  const projectId = activeLease.unit.propertyProfile?.project?.id ?? ''

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Messages</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Messages with your landlord about{' '}
          {activeLease.unit.unitLabel !== 'Main'
            ? activeLease.unit.unitLabel
            : (activeLease.unit.propertyProfile?.project?.name ?? 'your rental')}
        </p>
      </div>
      <PortalMessageThread
        tenantId={tenantId}
        unitId={activeLease.unitId}
        projectId={projectId}
        initialMessages={JSON.parse(JSON.stringify(messages))}
      />
    </div>
  )
}
