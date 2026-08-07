import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest } from '@/lib/api-response'
import { authedRoute } from '@/lib/api-handler'

const CreateServiceItemSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  unit: z.string().nullable().optional(),
  defaultRate: z.number().positive('Default rate must be positive'),
  defaultCostRate: z.number().nonnegative().nullable().optional(),
  tags: z.array(z.string()).default([]),
})

export const GET = authedRoute({
  handler: async ({ userId }) => {
    const items = await prisma.serviceItem.findMany({
      where: { userId },
      orderBy: { usageCount: 'desc' },
    })
    return ok(JSON.parse(JSON.stringify(items)), { count: items.length })
  },
})

export const POST = authedRoute<void, z.infer<typeof CreateServiceItemSchema>>({
  bodySchema: CreateServiceItemSchema,
  handler: async ({ userId, body }) => {
    const { description, unit, defaultRate, defaultCostRate, tags } = body

    const existing = await prisma.serviceItem.findFirst({
      where: { userId, description },
    })
    if (existing) return badRequest('A service item with this description already exists')

    const item = await prisma.serviceItem.create({
      data: {
        userId,
        description,
        unit: unit ?? null,
        defaultRate,
        defaultCostRate: defaultCostRate ?? null,
        tags,
      },
    })

    return created(JSON.parse(JSON.stringify(item)))
  },
})
