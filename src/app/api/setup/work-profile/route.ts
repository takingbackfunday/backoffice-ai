import { z } from 'zod'
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import { ok, created, badRequest } from '@/lib/api-response'
import { authedRoute } from '@/lib/api-handler'
import { openrouterChat } from '@/lib/llm/openrouter'
import { TemplateItemSchema, TemplateSectionSchema, StarterTemplateSchema } from '@/lib/starter-templates'
import { parsePreferences } from '@/types/preferences'
import { logger } from '@/lib/log'

const DescriptionSchema = z.object({
  description: z.string().trim().min(10).max(2000),
})

const ServiceItemGenSchema = z.object({
  description: z.string().min(1),
  unit: z.string().nullable().optional(),
  defaultRate: z.number().nonnegative(),
  defaultCostRate: z.number().nonnegative().nullable().optional(),
  tags: z.array(z.string()).default([]),
  groupName: z.string().optional(),
})

const LlmOutputSchema = z.object({
  templates: z.array(StarterTemplateSchema).min(1).max(4),
  serviceItems: z.array(ServiceItemGenSchema).min(1),
})

const SYSTEM_PROMPT = `You generate quote templates AND a reusable service-item library for freelancers.

Return ONLY JSON (no markdown, no prose):
{"templates": [...], "serviceItems": [...]}

Rules for templates (2-4 templates):
- Each template: {"name", "sections": [{"name", "items": [...]}]}
- Each item: {"description", "unit", "quantity", "rate", "costRate", "tags", "isOptional"}
- "unit" is 'hr', 'day', or 'x'
- "quantity" and "rate" are positive numbers
- "costRate" is the internal cost (0 if unknown)
- "tags" are short keywords for margin-rule matching
- 1-3 sections per template, 2-6 items per section

Rules for serviceItems:
- Deduplicated list — one entry per unique description across all templates
- Each entry: {"description", "unit", "defaultRate", "defaultCostRate", "tags", "groupName"}
- "groupName" is the template name this item belongs to (first template if shared)
- "defaultRate" matches the template rate
- "defaultCostRate" matches the template costRate (or null)

Keep descriptions professional and client-facing. Use realistic placeholder prices.`

export const POST = authedRoute<void, z.infer<typeof DescriptionSchema>>({
  bodySchema: DescriptionSchema,
  handler: async ({ userId, body }) => {
    let raw: string
    try {
      raw = await openrouterChat(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: body.description },
        ],
        'mistralai/mistral-small-2603',
        8192,
      )
    } catch (err) {
      logger.error('work-profile', 'LLM call failed', {
        message: err instanceof Error ? err.message : String(err),
      })
      return badRequest('We couldn\u2019t generate your profile from that description \u2014 try adding a bit more detail.')
    }

    let jsonStr = raw.trim()
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) jsonStr = fenceMatch[1].trim()
    const objMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (objMatch) jsonStr = objMatch[0]

    let parsed: unknown
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      logger.error('work-profile', 'JSON parse failed', { raw: raw.slice(0, 500) })
      return badRequest('We couldn\u2019t parse the generated output \u2014 please try again.')
    }

    const result = LlmOutputSchema.safeParse(parsed)
    if (!result.success) {
      logger.error('work-profile', 'Schema validation failed', {
        errors: result.error.issues.map(i => i.message),
      })
      return badRequest('The generated output didn\u2019t match the expected format \u2014 please try again.')
    }

    const { templates, serviceItems } = result.data
    const generationId = randomUUID()

    const createdItems = await prisma.$transaction(async tx => {
      const items = await Promise.all(
        serviceItems.map(item =>
          tx.serviceItem.create({
            data: {
              userId,
              description: item.description,
              unit: item.unit ?? null,
              defaultRate: item.defaultRate,
              defaultCostRate: item.defaultCostRate ?? null,
              tags: item.tags,
              groupName: item.groupName ?? null,
              generationId,
            },
          }),
        ),
      )
      return items
    })

    const descToItemId = new Map<string, string>()
    for (const item of createdItems) {
      descToItemId.set(item.description, item.id)
    }

    const createdTemplates = await prisma.$transaction(async tx => {
      return Promise.all(
        templates.map(t =>
          tx.quoteTemplate.create({
            data: {
              userId,
              name: t.name,
              sections: t.sections.map(s => ({
                name: s.name,
                sortOrder: s.sortOrder ?? 0,
                items: s.items.map(i => ({
                  description: i.description,
                  unit: i.unit ?? 'x',
                  quantity: i.quantity,
                  rate: i.rate ?? 0,
                  costRate: i.costRate ?? null,
                  tags: i.tags,
                  isOptional: i.isOptional,
                  serviceItemId: descToItemId.get(i.description),
                })),
              })),
            },
          }),
        ),
      )
    })

    const existing = await prisma.userPreference.findUnique({ where: { userId } })
    const current = parsePreferences(existing?.data)
    await prisma.userPreference.upsert({
      where: { userId },
      create: { userId, data: { ...current, workDescription: body.description } as never },
      update: { data: { ...current, workDescription: body.description } as never },
    })

    return created({
      generationId,
      templates: createdTemplates.map(t => ({
        id: t.id,
        name: t.name,
        sections: t.sections,
      })),
      serviceItems: createdItems.map(i => ({
        id: i.id,
        description: i.description,
        unit: i.unit,
        defaultRate: Number(i.defaultRate),
        defaultCostRate: i.defaultCostRate ? Number(i.defaultCostRate) : null,
        tags: i.tags,
        groupName: i.groupName,
      })),
      templateCount: createdTemplates.length,
      serviceItemCount: createdItems.length,
    })
  },
})

const RefinementSchema = z.object({
  description: z.string().trim().min(10).max(2000),
})

export const PATCH = authedRoute<void, z.infer<typeof RefinementSchema>>({
  bodySchema: RefinementSchema,
  handler: async ({ userId, body }) => {
    const [existingTemplates, existingItems] = await Promise.all([
      prisma.quoteTemplate.findMany({
        where: { userId },
        select: { name: true },
      }),
      prisma.serviceItem.findMany({
        where: { userId },
        select: { description: true },
      }),
    ])

    const existingNames = new Set(existingTemplates.map(t => t.name.toLowerCase()))
    const existingDescs = new Set(existingItems.map(i => i.description.toLowerCase()))

    let raw: string
    try {
      raw = await openrouterChat(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `My updated work description: ${body.description}\n\nI already have templates named: ${Array.from(existingNames).join(', ') || '(none yet)'}\nAnd service items: ${Array.from(existingDescs).join(', ') || '(none yet)'}\n\nGenerate NEW templates and service items that cover ADDITIONAL services I might offer — don't duplicate what I already have.`,
          },
        ],
        'mistralai/mistral-small-2603',
        8192,
      )
    } catch (err) {
      logger.error('work-profile-refine', 'LLM call failed', {
        message: err instanceof Error ? err.message : String(err),
      })
      return badRequest('We couldn\u2019t generate your profile from that description \u2014 try adding a bit more detail.')
    }

    let jsonStr = raw.trim()
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) jsonStr = fenceMatch[1].trim()
    const objMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (objMatch) jsonStr = objMatch[0]

    let parsed: unknown
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      logger.error('work-profile-refine', 'JSON parse failed', { raw: raw.slice(0, 500) })
      return badRequest('We couldn\u2019t parse the generated output \u2014 please try again.')
    }

    const result = LlmOutputSchema.safeParse(parsed)
    if (!result.success) {
      logger.error('work-profile-refine', 'Schema validation failed', {
        errors: result.error.issues.map(i => i.message),
      })
      return badRequest('The generated output didn\u2019t match the expected format \u2014 please try again.')
    }

    const { templates, serviceItems } = result.data

    const newTemplates = templates.filter(t => !existingNames.has(t.name.toLowerCase()))
    const newServiceItemDescs = serviceItems.filter(i => !existingDescs.has(i.description.toLowerCase()))

    if (newTemplates.length === 0 && newServiceItemDescs.length === 0) {
      return ok({ message: 'No new templates or items were generated. Try a more specific description.', templateCount: 0, serviceItemCount: 0 })
    }

    const generationId = randomUUID()

    const createdItems = await prisma.$transaction(async tx => {
      return Promise.all(
        newServiceItemDescs.map(item =>
          tx.serviceItem.create({
            data: {
              userId,
              description: item.description,
              unit: item.unit ?? null,
              defaultRate: item.defaultRate,
              defaultCostRate: item.defaultCostRate ?? null,
              tags: item.tags,
              groupName: item.groupName ?? null,
              generationId,
            },
          }),
        ),
      )
    })

    const descToItemId = new Map<string, string>()
    for (const item of createdItems) {
      descToItemId.set(item.description, item.id)
    }

    const createdTemplates = await prisma.$transaction(async tx => {
      return Promise.all(
        newTemplates.map(t =>
          tx.quoteTemplate.create({
            data: {
              userId,
              name: t.name,
              sections: t.sections.map(s => ({
                name: s.name,
                sortOrder: s.sortOrder ?? 0,
                items: s.items.map(i => ({
                  description: i.description,
                  unit: i.unit ?? 'x',
                  quantity: i.quantity,
                  rate: i.rate ?? 0,
                  costRate: i.costRate ?? null,
                  tags: i.tags,
                  isOptional: i.isOptional,
                  serviceItemId: descToItemId.get(i.description),
                })),
              })),
            },
          }),
        ),
      )
    })

    const existing = await prisma.userPreference.findUnique({ where: { userId } })
    const current = parsePreferences(existing?.data)
    await prisma.userPreference.upsert({
      where: { userId },
      create: { userId, data: { ...current, workDescription: body.description } as never },
      update: { data: { ...current, workDescription: body.description } as never },
    })

    return created({
      generationId,
      templates: createdTemplates.map(t => ({
        id: t.id,
        name: t.name,
        sections: t.sections,
      })),
      serviceItems: createdItems.map(i => ({
        id: i.id,
        description: i.description,
        unit: i.unit,
        defaultRate: Number(i.defaultRate),
        defaultCostRate: i.defaultCostRate ? Number(i.defaultCostRate) : null,
        tags: i.tags,
        groupName: i.groupName,
      })),
      templateCount: createdTemplates.length,
      serviceItemCount: createdItems.length,
    })
  },
})
