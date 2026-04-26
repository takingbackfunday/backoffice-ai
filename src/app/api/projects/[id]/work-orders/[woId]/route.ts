import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const UpdateWorkOrderSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  vendorId: z.string().nullable().optional(),
  agreedCost: z.number().nonnegative().nullable().optional(),
  status: z.enum(['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'BILLED', 'PAID', 'CANCELLED']).optional(),
  scheduledDate: z.string().nullable().optional(),
  completedDate: z.string().nullable().optional(),
})

interface RouteParams { params: Promise<{ id: string; woId: string }> }

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, woId } = await params
    const workOrder = await prisma.workOrder.findFirst({ where: { id: woId, workspaceId: id, userId } })
    if (!workOrder) return notFound('Work order not found')
    const body = await request.json()
    const parsed = UpdateWorkOrderSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))
    const updated = await prisma.workOrder.update({
      where: { id: woId },
      data: {
        ...(parsed.data.title !== undefined && { title: parsed.data.title }),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
        ...(parsed.data.vendorId !== undefined && { vendorId: parsed.data.vendorId }),
        ...(parsed.data.agreedCost !== undefined && { agreedCost: parsed.data.agreedCost }),
        ...(parsed.data.status !== undefined && { status: parsed.data.status }),
        ...(parsed.data.scheduledDate !== undefined && {
          scheduledDate: parsed.data.scheduledDate ? new Date(parsed.data.scheduledDate) : null,
        }),
        ...(parsed.data.completedDate !== undefined && {
          completedDate: parsed.data.completedDate ? new Date(parsed.data.completedDate) : null,
        }),
      },
      include: {
        vendor: { select: { id: true, name: true, specialty: true } },
        job: { select: { id: true, name: true } },
        maintenanceRequest: { select: { id: true, title: true } },
        bills: true,
      },
    })
    return ok(updated)
  } catch {
    return serverError('Failed to update work order')
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, woId } = await params
    const workOrder = await prisma.workOrder.findFirst({ where: { id: woId, workspaceId: id, userId } })
    if (!workOrder) return notFound('Work order not found')
    await prisma.workOrder.delete({ where: { id: woId } })
    return ok({ deleted: true })
  } catch {
    return serverError('Failed to delete work order')
  }
}
