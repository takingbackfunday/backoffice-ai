import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const CreateChargeSchema = z.object({
  type: z.enum(['RENT', 'LATE_FEE', 'MAINTENANCE', 'UTILITY', 'DEPOSIT', 'OTHER']),
  description: z.string().max(255).optional().nullable(),
  amount: z.number().positive('Amount must be positive'),
  dueDate: z.string().min(1, 'Due date is required'),
  maintenanceRequestId: z.string().optional().nullable(),
})

interface RouteParams { params: Promise<{ id: string; unitId: string }> }

async function resolveUnit(projectId: string, unitId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId, type: 'PROPERTY' },
    include: { propertyProfile: { select: { units: { where: { id: unitId }, select: { id: true } } } } },
  })
  if (!project?.propertyProfile) return null
  return project.propertyProfile.units[0] ?? null
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, unitId } = await params

    const unit = await resolveUnit(id, unitId, userId)
    if (!unit) return notFound('Unit not found')

    // Get the active lease for this unit to scope charges
    const lease = await prisma.lease.findFirst({
      where: { unitId, status: { in: ['ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH'] } },
      orderBy: { startDate: 'desc' },
    })
    if (!lease) return ok([], { count: 0 })

    const charges = await prisma.tenantCharge.findMany({
      where: { leaseId: lease.id },
      include: { maintenanceRequest: { select: { id: true, title: true } } },
      orderBy: { dueDate: 'desc' },
    })

    return ok(charges, { count: charges.length })
  } catch {
    return serverError('Failed to fetch charges')
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, unitId } = await params

    const unit = await resolveUnit(id, unitId, userId)
    if (!unit) return notFound('Unit not found')

    const body = await request.json()
    const parsed = CreateChargeSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))

    const { type, description, amount, dueDate, maintenanceRequestId } = parsed.data

    // MAINTENANCE/OTHER require a description
    if ((type === 'MAINTENANCE' || type === 'OTHER') && !description?.trim()) {
      return badRequest('Description is required for this charge type')
    }

    const lease = await prisma.lease.findFirst({
      where: { unitId, status: { in: ['ACTIVE', 'EXPIRING_SOON', 'MONTH_TO_MONTH'] } },
      orderBy: { startDate: 'desc' },
    })
    if (!lease) return badRequest('No active lease found for this unit')

    const charge = await prisma.tenantCharge.create({
      data: {
        leaseId: lease.id,
        tenantId: lease.tenantId,
        type,
        description: description?.trim() ?? null,
        amount,
        dueDate: new Date(dueDate),
        maintenanceRequestId: maintenanceRequestId ?? null,
      },
      include: { maintenanceRequest: { select: { id: true, title: true } } },
    })

    return created(charge)
  } catch {
    return serverError('Failed to create charge')
  }
}
