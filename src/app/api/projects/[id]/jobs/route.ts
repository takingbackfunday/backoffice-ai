import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const CreateJobSchema = z.object({
  name: z.string().min(1, 'Job name is required'),
  description: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']).optional(),
  budgetAmount: z.number().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
})

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const project = await prisma.workspace.findFirst({
      where: { id, userId, type: 'CLIENT' },
      include: { clientProfile: true },
    })
    if (!project || !project.clientProfile) return notFound('Client project not found')

    const jobs = await prisma.job.findMany({
      where: { clientProfileId: project.clientProfile.id },
      orderBy: { createdAt: 'desc' },
    })

    return ok(jobs, { count: jobs.length })
  } catch {
    return serverError('Failed to fetch jobs')
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const project = await prisma.workspace.findFirst({
      where: { id, userId, type: 'CLIENT' },
      include: { clientProfile: true },
    })
    if (!project || !project.clientProfile) return notFound('Client project not found')

    const body = await request.json()
    const parsed = CreateJobSchema.safeParse(body)
    if (!parsed.success) {
      return badRequest(parsed.error.errors.map((e) => e.message).join(', '))
    }

    const job = await prisma.job.create({
      data: {
        clientProfileId: project.clientProfile.id,
        name: parsed.data.name,
        description: parsed.data.description,
        status: parsed.data.status ?? 'ACTIVE',
        budgetAmount: parsed.data.budgetAmount,
        startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
        endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
      },
    })

    return created(job)
  } catch {
    return serverError('Failed to create job')
  }
}
