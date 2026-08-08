import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ok, created } from '@/lib/api-response'
import { authedRoute } from '@/lib/api-handler'
import { TemplateSectionSchema } from '@/lib/quote-template-schemas'

const CreateTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  sections: z.array(TemplateSectionSchema),
})

export const GET = authedRoute({
  handler: async ({ userId }) => {
    const templates = await prisma.quoteTemplate.findMany({
      where: { userId },
      select: { id: true, name: true, sections: true, usageCount: true },
      orderBy: [{ usageCount: 'desc' }, { name: 'asc' }],
    })
    return ok(templates, { count: templates.length })
  },
})

export const POST = authedRoute<void, z.infer<typeof CreateTemplateSchema>>({
  bodySchema: CreateTemplateSchema,
  handler: async ({ userId, body }) => {
    const template = await prisma.quoteTemplate.create({
      data: {
        userId,
        name: body.name,
        sections: body.sections,
      },
    })
    return created(JSON.parse(JSON.stringify(template)))
  },
})
