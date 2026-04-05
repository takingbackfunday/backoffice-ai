import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response'

const EstimateItemSchema = z.object({
  id: z.string().optional(),
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
  id: z.string().optional(),
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
  items: z.array(EstimateItemSchema).default([]),
})

const UpdateEstimateSchema = z.object({
  title: z.string().min(1).optional(),
  currency: z.string().optional(),
  notes: z.string().optional().nullable(),
  sections: z.array(EstimateSectionSchema).optional(),
})

interface RouteParams { params: Promise<{ id: string; jobId: string; estId: string }> }

async function getEstimateForUser(estId: string, jobId: string, projectId: string, userId: string) {
  return prisma.estimate.findFirst({
    where: {
      id: estId,
      jobId,
      job: { clientProfile: { workspace: { id: projectId, userId } } },
    },
    include: {
      sections: { include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
    },
  })
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, jobId, estId } = await params

    const estimate = await getEstimateForUser(estId, jobId, id, userId)
    if (!estimate) return notFound('Estimate not found')

    return ok(JSON.parse(JSON.stringify(estimate)))
  } catch (e) {
    console.error('[estimate GET]', e)
    return serverError()
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, jobId, estId } = await params

    const estimate = await getEstimateForUser(estId, jobId, id, userId)
    if (!estimate) return notFound('Estimate not found')

    if (estimate.status === 'FINAL') {
      return badRequest('Finalized estimates cannot be edited directly. Create a revision instead.')
    }

    const body = await request.json()
    const parsed = UpdateEstimateSchema.safeParse(body)
    if (!parsed.success) return badRequest(parsed.error.errors[0].message)

    const { sections, ...rest } = parsed.data

    const updated = await prisma.$transaction(async (tx) => {
      // Replace sections if provided
      if (sections !== undefined) {
        await tx.estimateSection.deleteMany({ where: { estimateId: estId } })
        await tx.estimate.update({
          where: { id: estId },
          data: {
            ...rest,
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
      } else {
        await tx.estimate.update({ where: { id: estId }, data: rest })
      }

      return tx.estimate.findUnique({
        where: { id: estId },
        include: {
          sections: { include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
        },
      })
    })

    return ok(JSON.parse(JSON.stringify(updated)))
  } catch (e) {
    console.error('[estimate PATCH]', e)
    return serverError()
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { userId } = await auth()
    if (!userId) return unauthorized()
    const { id, jobId, estId } = await params

    const estimate = await getEstimateForUser(estId, jobId, id, userId)
    if (!estimate) return notFound('Estimate not found')

    // Cannot delete an estimate that has quotes
    const quoteCount = await prisma.quote.count({ where: { estimateId: estId } })
    if (quoteCount > 0) {
      return badRequest('Cannot delete an estimate that has quotes. Delete the quotes first.')
    }

    await prisma.estimate.delete({ where: { id: estId } })
    return ok({ id: estId })
  } catch (e) {
    console.error('[estimate DELETE]', e)
    return serverError()
  }
}
