import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const UpdateMaintenanceSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY']).optional(),
  status: z.enum(['OPEN', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  scheduledDate: z.string().optional(),
  completedDate: z.string().optional(),
  cost: z.number().optional(),
  vendorName: z.string().optional(),
})

interface RouteParams { params: Promise<{ id: string; requestId: string }> }

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, requestId } = await params

    const project = await prisma.workspace.findFirst({
      where: { id, userId, type: 'PROPERTY' },
      include: { propertyProfile: { include: { units: { select: { id: true } } } } },
    })
    if (!project || !project.propertyProfile) return notFound('Property project not found')

    const unitIds = project.propertyProfile.units.map(u => u.id)
    const existing = await prisma.maintenanceRequest.findFirst({
      where: { id: requestId, unitId: { in: unitIds } },
    })
    if (!existing) return notFound('Maintenance request not found')

    const body = await request.json()
    const parsed = UpdateMaintenanceSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const req = await prisma.maintenanceRequest.update({
      where: { id: requestId },
      data: {
        ...parsed.data,
        scheduledDate: parsed.data.scheduledDate ? new Date(parsed.data.scheduledDate) : undefined,
        completedDate: parsed.data.completedDate ? new Date(parsed.data.completedDate) : undefined,
      },
      include: { unit: true, tenant: true },
    })

    return ok(req)
  } catch {
    return serverError('Failed to update maintenance request')
  }
}
