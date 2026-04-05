import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { LeaseSigningClient } from '@/components/public/lease-signing-client'

export default async function LeaseSignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const lease = await prisma.lease.findFirst({
    where: {
      signingToken: token,
      contractStatus: { in: ['SENT', 'READY', 'SIGNED'] },
    },
    include: {
      unit: {
        include: {
          propertyProfile: {
            include: { workspace: { select: { name: true } } },
          },
        },
      },
      tenant: { select: { name: true, email: true } },
    },
  })

  if (!lease) return notFound()

  const serialized = {
    id: lease.id,
    signingToken: lease.signingToken!,
    tenantSignedAt: lease.tenantSignedAt ? lease.tenantSignedAt.toISOString() : null,
    contractStatus: lease.contractStatus,
    startDate: lease.startDate.toISOString(),
    endDate: lease.endDate.toISOString(),
    monthlyRent: Number(lease.monthlyRent),
    securityDeposit: lease.securityDeposit ? Number(lease.securityDeposit) : null,
    currency: lease.currency,
    contractNotes: lease.contractNotes,
    tenant: { name: lease.tenant.name, email: lease.tenant.email },
    unit: {
      unitLabel: lease.unit.unitLabel,
      propertyProfile: {
        address: lease.unit.propertyProfile.address,
        city: lease.unit.propertyProfile.city,
        state: lease.unit.propertyProfile.state,
        workspace: { name: lease.unit.propertyProfile.workspace.name },
      },
    },
  }

  return <LeaseSigningClient lease={serialized} />
}
