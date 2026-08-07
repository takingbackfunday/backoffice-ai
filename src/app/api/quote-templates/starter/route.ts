import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { created, badRequest } from '@/lib/api-response'
import { authedRoute } from '@/lib/api-handler'
import { openrouterChat } from '@/lib/llm/openrouter'
import { STARTER_TRADES, StarterTemplateSchema } from '@/lib/starter-templates'
import { logger } from '@/lib/log'

const BodySchema = z.object({
  trade: z.string().optional(),
  description: z.string().trim().min(10).max(1000).optional(),
}).refine(d => !!d.trade !== !!d.description, {
  message: 'Provide exactly one of trade or description',
})

export const POST = authedRoute<void, z.infer<typeof BodySchema>>({
  bodySchema: BodySchema,
  handler: async ({ userId, body }) => {
    let templates: z.infer<typeof StarterTemplateSchema>[]

    if (body.trade) {
      const trade = STARTER_TRADES.find(t => t.id === body.trade)
      if (!trade) return badRequest('Unknown trade')
      templates = trade.templates
    } else {
      const systemPrompt = `You generate starter quote templates for freelancers. Return ONLY JSON (no markdown, no prose): {"templates": [...]} — 2 or 3 templates. Each template: {"name", "sections": [{"name", "items": [{"description", "unit", "quantity", "rate"}]}]}. "unit" is 'hr', 'day' or 'x'; "quantity" positive; "rate" a typical USD placeholder for the described work; 2–5 items per section, 1–3 sections per template. Do not include costRate/tags/isOptional.`

      let raw: string
      try {
        raw = await openrouterChat(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: body.description! },
          ],
          'mistralai/mistral-small-2603',
        )
      } catch (err) {
        logger.error('quote-templates-starter', 'LLM call failed', {
          message: err instanceof Error ? err.message : String(err),
        })
        return badRequest('We couldn\u2019t generate templates from that description — try adding a bit more detail.')
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
        logger.error('quote-templates-starter', 'JSON parse failed', { raw: raw.slice(0, 500) })
        return badRequest('We couldn\u2019t generate templates from that description — try adding a bit more detail.')
      }

      const result = z.object({
        templates: z.array(StarterTemplateSchema).min(1).max(4),
      }).safeParse(parsed)

      if (!result.success) {
        logger.error('quote-templates-starter', 'Schema validation failed', {
          errors: result.error.issues.map(i => i.message),
        })
        return badRequest('We couldn\u2019t generate templates from that description — try adding a bit more detail.')
      }

      templates = result.data.templates
    }

    await prisma.quoteTemplate.createMany({
      data: templates.map(t => ({
        userId,
        name: t.name,
        sections: t.sections,
      })),
    })

    return created({ count: templates.length })
  },
})
