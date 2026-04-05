import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const UpdateLeaseSchema = z.object({
  status: z.enum(['DRAFT', 'ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH', 'TERMINATED', 'EXPIRED']).optional(),
  endDate: z.string().optional(),
  monthlyRent: z.number().optional(),
  securityDeposit: z.number().optional(),
  paymentDueDay: z.number().int().min(1).max(28).optional(),
  lateFeeAmount: z.number().optional(),
  lateFeeGraceDays: z.number().int().optional(),
  currency: z.string().length(3).optional(),
  contractNotes: z.string().optional(),
  contractStatus: z.enum(['NONE', 'DRAFTING', 'READY', 'SENT', 'SIGNED', 'COUNTERSIGNED']).optional(),
  contractSignedAt: z.string().optional(),
})

interface RouteParams { params: Promise<{ id: string; leaseId: string }> }

export async function PATCH(request: Request, { params }: RouteParams) {
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
    const existing = await prisma.lease.findFirst({
      where: { id: leaseId, unitId: { in: unitIds } },
    })
    if (!existing) return notFound('Lease not found')

    const body = await request.json()
    const parsed = UpdateLeaseSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const { contractSignedAt, ...restData } = parsed.data
    const lease = await prisma.lease.update({
      where: { id: leaseId },
      data: {
        ...restData,
        endDate: restData.endDate ? new Date(restData.endDate) : undefined,
        contractSignedAt: contractSignedAt ? new Date(contractSignedAt) : undefined,
      },
      include: { unit: true, tenant: true },
    })

    if (parsed.data.status === 'TERMINATED' || parsed.data.status === 'EXPIRED') {
      await prisma.unit.update({
        where: { id: existing.unitId },
        data: { status: 'PREPARING' },
      })
    }

    return ok(lease)
  } catch {
    return serverError('Failed to update lease')
  }
}
