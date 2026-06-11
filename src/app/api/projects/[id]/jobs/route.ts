import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest } from '@/lib/api-response'
import { authedRoute } from '@/lib/api-handler'
import { requireWorkspace } from '@/lib/authz'
import type { Prisma } from '@/generated/prisma/client'

const ParamsSchema = z.object({ id: z.string() })

type ClientWorkspace = Prisma.WorkspaceGetPayload<{
  include: { clientProfile: true }
}>

const CreateJobSchema = z.object({
  name: z.string().min(1, 'Job name is required'),
  description: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']).optional(),
  budgetAmount: z.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
})

export const GET = authedRoute<{ id: string }>({
  paramsSchema: ParamsSchema,
  handler: async ({ userId, params }) => {
    const project = await requireWorkspace(userId, params.id, { clientProfile: true }) as ClientWorkspace
    if (!project.clientProfile) return badRequest('Client project not found')

    const jobs = await prisma.job.findMany({
      where: { clientProfileId: project.clientProfile.id },
      orderBy: { createdAt: 'desc' },
    })
    return ok(jobs, { count: jobs.length })
  },
})

export const POST = authedRoute<{ id: string }, z.infer<typeof CreateJobSchema>>({
  paramsSchema: ParamsSchema,
  bodySchema: CreateJobSchema,
  handler: async ({ userId, params, body }) => {
    const project = await requireWorkspace(userId, params.id, { clientProfile: true }) as ClientWorkspace
    if (!project.clientProfile) return badRequest('Client project not found')

    const job = await prisma.job.create({
      data: {
        clientProfileId: project.clientProfile.id,
        name: body.name,
        description: body.description,
        status: body.status ?? 'ACTIVE',
        budgetAmount: body.budgetAmount,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
      },
    })
    return created(job)
  },
})
