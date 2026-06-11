import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created } from '@/lib/api-response'
import { authedRoute } from '@/lib/api-handler'
import { requireWorkspace } from '@/lib/authz'

const ParamsSchema = z.object({ id: z.string() })

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

export const GET = authedRoute<{ id: string }>({
  paramsSchema: ParamsSchema,
  handler: async ({ userId, params }) => {
    await requireWorkspace(userId, params.id)
    const estimates = await prisma.estimate.findMany({
      where: { workspaceId: params.id },
      include: {
        sections: { include: { items: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } },
        _count: { select: { quotes: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return ok(JSON.parse(JSON.stringify(estimates)), { count: estimates.length })
  },
})

export const POST = authedRoute<{ id: string }, z.infer<typeof CreateEstimateSchema>>({
  paramsSchema: ParamsSchema,
  bodySchema: CreateEstimateSchema,
  handler: async ({ userId, params, body }) => {
    await requireWorkspace(userId, params.id)
    const { title, currency, notes, sections } = body
    const estimate = await prisma.estimate.create({
      data: {
        workspaceId: params.id,
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
  },
})
