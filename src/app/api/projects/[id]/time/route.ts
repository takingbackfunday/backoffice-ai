import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const project = await prisma.workspace.findFirst({ where: { id, userId } })
    if (!project) return notFound('Project not found')

    const entries = await prisma.timeEntry.findMany({
      where: { workspaceId: id },
      include: { job: { select: { id: true, name: true } } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    })

    return ok(JSON.parse(JSON.stringify(entries)), { count: entries.length })
  } catch (e) {
    console.error('[time GET]', e)
    return serverError()
  }
}

const CreateTimeEntrySchema = z.object({
  date: z.string().min(1, 'Date is required'),
  minutes: z.number().int().min(1, 'Duration must be at least 1 minute'),
  description: z.string().min(1, 'Description is required'),
  billable: z.boolean().optional().default(true),
  rate: z.number().positive().optional().nullable(),
  jobId: z.string().optional().nullable(),
})

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id } = await params

    const project = await prisma.workspace.findFirst({ where: { id, userId } })
    if (!project) return notFound('Project not found')

    const body = await request.json()
    const parsed = CreateTimeEntrySchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors[0].message)

    const { date, minutes, description, billable, rate, jobId } = parsed.data

    if (jobId) {
      const job = await prisma.job.findFirst({
        where: { id: jobId, clientProfile: { workspaceId: id } },
      })
      if (!job) return notFound('Job not found')
    }

    const entry = await prisma.timeEntry.create({
      data: {
        userId,
        workspaceId: id,
        jobId: jobId ?? null,
        date: new Date(date),
        minutes,
        description,
        billable,
        rate: rate ?? null,
      },
      include: { job: { select: { id: true, name: true } } },
    })

    return created(JSON.parse(JSON.stringify(entry)))
  } catch (e) {
    console.error('[time POST]', e)
    return serverError()
  }
}
