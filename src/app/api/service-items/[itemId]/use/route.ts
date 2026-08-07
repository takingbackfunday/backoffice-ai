import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok } from '@/lib/api-response'
import { authedRoute } from '@/lib/api-handler'
import { NotFoundError } from '@/lib/not-found-error'

const ParamsSchema = z.object({ itemId: z.string() })

export const POST = authedRoute<{ itemId: string }>({
  paramsSchema: ParamsSchema,
  handler: async ({ userId, params }) => {
    const item = await prisma.serviceItem.findFirst({
      where: { id: params.itemId, userId },
    })
    if (!item) throw new NotFoundError('Service item not found')

    await prisma.serviceItem.update({
      where: { id: params.itemId },
      data: { usageCount: { increment: 1 } },
    })

    return ok({ used: true })
  },
})
