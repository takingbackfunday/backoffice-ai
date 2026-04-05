import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const EstimateItemSchema = z.object({
  description: z.string().min(1),
  hours: z.number().optional().nullable(),
  costRate: z.number().optional().nullable(),
  quantity: z.number().positive().default(1),
  unit: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
  isOptional: z.boolean().default(false),
  internalNotes: z.string().optional().nullable(),
  riskLevel: z.string().optional().nullable(),
  sortOrder: z.number().int().default(0),
})

const EstimateSectionSchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
  items: z.array(EstimateItemSchema).default([]),
})

const CreateEstimateSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  currency: z.string().default('USD'),
  notes: z.string().optional().nullable(),
  sections: z.array(EstimateSectionSchema).default([]),
})

interface RouteParams { params: Promise<{ id: string; jobId: string }> }

async function getJobForUser(projectId: string, jobId: string, userId: string) {
  return prisma.job.findFirst({
    where: {
      id: jobId,
      clientProfile: { workspace: { id: projectId, userId } },
    },
    include: { clientProfile: true },
  })
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, jobId } = await params

    const job = await getJobForUser(id, jobId, userId)
    if (!job) return notFound('Job not found')

    const estimates = await prisma.estimate.findMany({
      where: { jobId },
      include: {
        sections: { include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
        _count: { select: { quotes: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return ok(JSON.parse(JSON.stringify(estimates)), { count: estimates.length })
  } catch (e) {
    console.error('[estimates GET]', e)
    return serverError()
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, jobId } = await params

    const job = await getJobForUser(id, jobId, userId)
    if (!job) return notFound('Job not found')

    const body = await request.json()
    const parsed = CreateEstimateSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors[0].message)

    const { title, currency, notes, sections } = parsed.data

    const estimate = await prisma.estimate.create({
      data: {
        jobId,
        title,
        currency,
        notes,
        sections: {
          create: sections.map((s, si) => ({
            name: s.name,
            sortOrder: s.sortOrder ?? si,
            items: {
              create: s.items.map((item, ii) => ({
                description: item.description,
                hours: item.hours,
                costRate: item.costRate,
                quantity: item.quantity,
                unit: item.unit,
                tags: item.tags,
                isOptional: item.isOptional,
                internalNotes: item.internalNotes,
                riskLevel: item.riskLevel,
                sortOrder: item.sortOrder ?? ii,
              })),
            },
          })),
        },
      },
      include: {
        sections: { include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
      },
    })

    return created(JSON.parse(JSON.stringify(estimate)))
  } catch (e) {
    console.error('[estimates POST]', e)
    return serverError()
  }
}
