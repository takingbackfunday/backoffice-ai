import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created } from '@/lib/api-response'
import { authedRoute } from '@/lib/api-handler'
import { requireWorkspace } from '@/lib/authz'

const ParamsSchema = z.object({ id: z.string() })

const CreateWorkOrderSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  vendorId: z.string().optional(),
  jobId: z.string().optional(),
  maintenanceRequestId: z.string().optional(),
  agreedCost: z.number().nonnegative().optional(),
  scheduledDate: z.string().optional(),
})

export const GET = authedRoute<{ id: string }>({
  paramsSchema: ParamsSchema,
  handler: async ({ userId, params }) => {
    await requireWorkspace(userId, params.id)
    const workOrders = await prisma.workOrder.findMany({
      where: { workspaceId: params.id },
      include: {
        vendor: { select: { id: true, name: true, specialty: true } },
        job: { select: { id: true, name: true } },
        maintenanceRequest: { select: { id: true, title: true } },
        bills: { orderBy: { issueDate: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return ok(workOrders, { count: workOrders.length })
  },
})

export const POST = authedRoute<{ id: string }, z.infer<typeof CreateWorkOrderSchema>>({
  paramsSchema: ParamsSchema,
  bodySchema: CreateWorkOrderSchema,
  handler: async ({ userId, params, body }) => {
    await requireWorkspace(userId, params.id)
    const workOrder = await prisma.workOrder.create({
      data: {
        userId,
        workspaceId: params.id,
        title: body.title,
        description: body.description ?? null,
        vendorId: body.vendorId ?? null,
        jobId: body.jobId ?? null,
        maintenanceRequestId: body.maintenanceRequestId ?? null,
        agreedCost: body.agreedCost ?? null,
        scheduledDate: body.scheduledDate ? new Date(body.scheduledDate) : null,
        status: body.vendorId ? 'ASSIGNED' : 'OPEN',
      },
      include: {
        vendor: { select: { id: true, name: true, specialty: true } },
        job: { select: { id: true, name: true } },
        maintenanceRequest: { select: { id: true, title: true } },
        bills: true,
      },
    })
    return created(workOrder)
  },
})
