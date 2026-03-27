import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const UpdateJobSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']).optional(),
  budgetAmount: z.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
})

interface RouteParams { params: Promise<{ id: string; jobId: string }> }

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, jobId } = await params

    const project = await prisma.project.findFirst({
      where: { id, userId, type: 'CLIENT' },
      include: { clientProfile: true },
    })
    if (!project || !project.clientProfile) return notFound('Client project not found')

    const existing = await prisma.job.findFirst({
      where: { id: jobId, clientProfileId: project.clientProfile.id },
    })
    if (!existing) return notFound('Job not found')

    const body = await request.json()
    const parsed = UpdateJobSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const job = await prisma.job.update({
      where: { id: jobId },
      data: {
        ...parsed.data,
        startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
        endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
      },
    })

    return ok(job)
  } catch {
    return serverError('Failed to update job')
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, jobId } = await params

    const project = await prisma.project.findFirst({
      where: { id, userId, type: 'CLIENT' },
      include: { clientProfile: true },
    })
    if (!project || !project.clientProfile) return notFound('Client project not found')

    const existing = await prisma.job.findFirst({
      where: { id: jobId, clientProfileId: project.clientProfile.id },
    })
    if (!existing) return notFound('Job not found')

    await prisma.job.delete({ where: { id: jobId } })
    return ok({ deleted: true })
  } catch {
    return serverError('Failed to delete job')
  }
}
