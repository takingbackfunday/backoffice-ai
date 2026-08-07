import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok } from '@/lib/api-response'
import { authedRoute } from '@/lib/api-handler'
import { NotFoundError } from '@/lib/not-found-error'

const ParamsSchema = z.object({ templateId: z.string() })

export const DELETE = authedRoute<{ templateId: string }>({
  paramsSchema: ParamsSchema,
  handler: async ({ userId, params }) => {
    const template = await prisma.quoteTemplate.findFirst({
      where: { id: params.templateId, userId },
    })
    if (!template) throw new NotFoundError('Quote template not found')

    await prisma.quoteTemplate.delete({ where: { id: params.templateId } })
    return ok({ deleted: true })
  },
})
