import { auth } from '@clerk/nextjs/server'
import { prisma } from '@/lib/prisma'
import { ok, unauthorized, notFound, badRequest, serverError } from '@/lib/api-response'

interface RouteParams { params: Promise<{ id: string; leaseId: string }> }

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, leaseId } = await params

    const project = await prisma.workspace.findFirst({
      where: { id, userId, type: 'PROPERTY' },
      include: { propertyProfile: { include: { units: { select: { id: true } } } } },
    })
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const unitIds = project.propertyProfile.units.map(u => u.id)
    const lease = await prisma.lease.findFirst({
      where: { id: leaseId, unitId: { in: unitIds } },
      include: { replacedBy: { select: { id: true } } },
    })
    if (!lease) return notFound('Lease not found')

    if (!['DRAFT', 'ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH'].includes(lease.status)) {
      return badRequest('Only active or draft leases can be renegotiated')
    }
    if (lease.replacedBy) {
      return badRequest('This lease has already been superseded by a renegotiated version')
    }

    const newLease = await prisma.$transaction(async tx => {
      // Terminate the original lease
      await tx.lease.update({
        where: { id: leaseId },
        data: { status: 'TERMINATED' },
      })

      // Create a replacement DRAFT copying all terms
      return tx.lease.create({
        data: {
          unitId: lease.unitId,
          tenantId: lease.tenantId,
          applicantId: lease.applicantId,
          startDate: lease.startDate,
          endDate: lease.endDate,
          monthlyRent: lease.monthlyRent,
          securityDeposit: lease.securityDeposit ?? undefined,
          paymentDueDay: lease.paymentDueDay,
          lateFeeAmount: lease.lateFeeAmount ?? undefined,
          lateFeeGraceDays: lease.lateFeeGraceDays,
          currency: lease.currency,
          contractNotes: lease.contractNotes ?? undefined,
          additionalCharges: lease.additionalCharges ?? [],
          utilitiesIncluded: lease.utilitiesIncluded ?? [],
          leaseRules: lease.leaseRules ?? {},
          status: 'DRAFT',
          contractStatus: 'NONE',
          replacesLeaseId: leaseId,
        },
        include: { unit: true, tenant: true, _count: { select: { invoices: true } } },
      })
    })

    return ok(newLease)
  } catch {
    return serverError('Failed to renegotiate lease')
  }
}
