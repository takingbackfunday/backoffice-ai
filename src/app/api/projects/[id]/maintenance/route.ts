import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const CreateMaintenanceSchema = z.object({
  unitId: z.string().min(1, 'Unit is required'),
  tenantId: z.string().optional(),
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY']).optional(),
})

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const project = await prisma.project.findFirst({
      where: { id, userId, type: 'PROPERTY' },
      include: { propertyProfile: { include: { units: { select: { id: true } } } } },
    })
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const unitIds = project.propertyProfile.units.map(u => u.id)

    const requests = await prisma.maintenanceRequest.findMany({
      where: { unitId: { in: unitIds } },
      include: { unit: true, tenant: true },
      orderBy: { createdAt: 'desc' },
    })

    return ok(requests, { count: requests.length })
  } catch {
    return serverError('Failed to fetch maintenance requests')
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const project = await prisma.project.findFirst({
      where: { id, userId, type: 'PROPERTY' },
      include: { propertyProfile: { include: { units: { select: { id: true } } } } },
    })
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const body = await request.json()
    const parsed = CreateMaintenanceSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const unitIds = project.propertyProfile.units.map(u => u.id)
    if (!unitIds.includes(parsed.data.unitId)) {
      return badRequest('Unit does not belong to this property')
    }

    const req = await prisma.maintenanceRequest.create({
      data: {
        unitId: parsed.data.unitId,
        tenantId: parsed.data.tenantId,
        title: parsed.data.title,
        description: parsed.data.description,
        priority: parsed.data.priority ?? 'MEDIUM',
      },
      include: { unit: true, tenant: true },
    })

    return created(req)
  } catch {
    return serverError('Failed to create maintenance request')
  }
}
