import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const UpdateUnitSchema = z.object({
  unitLabel: z.string().min(1).optional(),
  status: z.enum(['VACANT', 'LEASED', 'NOTICE_GIVEN', 'PREPARING', 'MAINTENANCE', 'LISTED']).optional(),
  bedrooms: z.number().int().optional(),
  bathrooms: z.number().optional(),
  squareFootage: z.number().int().optional(),
  monthlyRent: z.number().optional(),
})

interface RouteParams { params: Promise<{ id: string; unitId: string }> }

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, unitId } = await params

    const project = await prisma.workspace.findFirst({
      where: { id, userId, type: 'PROPERTY' },
      include: { propertyProfile: true },
    })
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const unit = await prisma.unit.findFirst({
      where: { id: unitId, propertyProfileId: project.propertyProfile.id },
      include: {
        leases: {
          include: {
            tenant: true,
            invoices: {
              where: { status: { not: 'VOID' } },
              include: { lineItems: true, payments: true },
              orderBy: { dueDate: 'desc' },
              take: 12,
            },
          },
          orderBy: { startDate: 'desc' },
        },
        maintenanceRequests: { orderBy: { createdAt: 'desc' }, take: 10 },
        messages: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    })

    if (!unit) return notFound('Unit not found')
    return ok(unit)
  } catch {
    return serverError('Failed to fetch unit')
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, unitId } = await params

    const project = await prisma.workspace.findFirst({
      where: { id, userId, type: 'PROPERTY' },
      include: { propertyProfile: true },
    })
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const existing = await prisma.unit.findFirst({
      where: { id: unitId, propertyProfileId: project.propertyProfile.id },
    })
    if (!existing) return notFound('Unit not found')

    const body = await request.json()
    const parsed = UpdateUnitSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const unit = await prisma.unit.update({
      where: { id: unitId },
      data: parsed.data,
    })

    return ok(unit)
  } catch {
    return serverError('Failed to update unit')
  }
}
