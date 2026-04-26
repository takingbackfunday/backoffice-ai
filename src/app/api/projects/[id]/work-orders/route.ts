import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const CreateWorkOrderSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  vendorId: z.string().optional(),
  jobId: z.string().optional(),
  maintenanceRequestId: z.string().optional(),
  agreedCost: z.number().nonnegative().optional(),
  scheduledDate: z.string().optional(),
})

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params
    const workspace = await prisma.workspace.findFirst({ where: { id, userId } })
    if (!workspace) return notFound('Workspace not found')
    const workOrders = await prisma.workOrder.findMany({
      where: { workspaceId: id },
      include: {
        vendor: { select: { id: true, name: true, specialty: true } },
        job: { select: { id: true, name: true } },
        maintenanceRequest: { select: { id: true, title: true } },
        bills: { orderBy: { issueDate: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return ok(workOrders, { count: workOrders.length })
  } catch {
    return serverError('Failed to fetch work orders')
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params
    const workspace = await prisma.workspace.findFirst({ where: { id, userId } })
    if (!workspace) return notFound('Workspace not found')
    const body = await request.json()
    const parsed = CreateWorkOrderSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors.map(e => e.message).join(', '))
    const workOrder = await prisma.workOrder.create({
      data: {
        userId,
        workspaceId: id,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        vendorId: parsed.data.vendorId ?? null,
        jobId: parsed.data.jobId ?? null,
        maintenanceRequestId: parsed.data.maintenanceRequestId ?? null,
        agreedCost: parsed.data.agreedCost ?? null,
        scheduledDate: parsed.data.scheduledDate ? new Date(parsed.data.scheduledDate) : null,
        status: parsed.data.vendorId ? 'ASSIGNED' : 'OPEN',
      },
      include: {
        vendor: { select: { id: true, name: true, specialty: true } },
        job: { select: { id: true, name: true } },
        maintenanceRequest: { select: { id: true, title: true } },
        bills: true,
      },
    })
    return created(workOrder)
  } catch {
    return serverError('Failed to create work order')
  }
}
