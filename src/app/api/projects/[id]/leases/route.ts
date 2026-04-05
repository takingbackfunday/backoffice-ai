import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const CreateLeaseSchema = z.object({
  unitId: z.string().min(1, 'Unit is required'),
  tenantId: z.string().min(1, 'Tenant is required'),
  status: z.enum(['DRAFT', 'ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH', 'TERMINATED', 'EXPIRED']).optional(),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  monthlyRent: z.number().min(0, 'Monthly rent is required'),
  securityDeposit: z.number().optional(),
  paymentDueDay: z.number().int().min(1).max(28).optional(),
  lateFeeAmount: z.number().optional(),
  lateFeeGraceDays: z.number().int().optional(),
  currency: z.string().length(3).optional(),
  contractNotes: z.string().optional(),
})

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const project = await prisma.workspace.findFirst({
      where: { id, userId, type: 'PROPERTY' },
      include: { propertyProfile: { include: { units: { select: { id: true } } } } },
    })
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const unitIds = project.propertyProfile.units.map(u => u.id)

    const leases = await prisma.lease.findMany({
      where: { unitId: { in: unitIds } },
      include: {
        unit: true,
        tenant: true,
        _count: { select: { invoices: true } },
      },
      orderBy: { startDate: 'desc' },
    })

    return ok(leases, { count: leases.length })
  } catch {
    return serverError('Failed to fetch leases')
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const project = await prisma.workspace.findFirst({
      where: { id, userId, type: 'PROPERTY' },
      include: { propertyProfile: { include: { units: { select: { id: true } } } } },
    })
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const body = await request.json()
    const parsed = CreateLeaseSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const unitIds = project.propertyProfile.units.map(u => u.id)
    if (!unitIds.includes(parsed.data.unitId)) {
      return badRequest('Unit does not belong to this property')
    }

    const tenant = await prisma.tenant.findFirst({
      where: { id: parsed.data.tenantId, userId },
    })
    if (!tenant) return badRequest('Tenant not found')

    const lease = await prisma.lease.create({
      data: {
        unitId: parsed.data.unitId,
        tenantId: parsed.data.tenantId,
        status: parsed.data.status ?? 'ACTIVE',
        startDate: new Date(parsed.data.startDate),
        endDate: new Date(parsed.data.endDate),
        monthlyRent: parsed.data.monthlyRent,
        securityDeposit: parsed.data.securityDeposit,
        paymentDueDay: parsed.data.paymentDueDay ?? 1,
        lateFeeAmount: parsed.data.lateFeeAmount,
        lateFeeGraceDays: parsed.data.lateFeeGraceDays ?? 5,
        currency: parsed.data.currency ?? 'USD',
        contractNotes: parsed.data.contractNotes,
      },
      include: { unit: true, tenant: true },
    })

    await prisma.unit.update({
      where: { id: parsed.data.unitId },
      data: { status: 'LEASED' },
    })

    return created(lease)
  } catch {
    return serverError('Failed to create lease')
  }
}
